// Auto's: geparkeerde auto's om in te stappen, rijgedrag en verkeer.
// De modellen zelf staan in cartypes.js (vorm) en carmat.js (materialen); hier worden ze neergezet en bewogen.
import * as THREE from 'three';
import { rng } from './world.js';
import { Q } from './quality.js';
import { buildCar } from './cartypes.js';
import { CarMaterials, PLATE_COUNT } from './carmat.js';

// Maten per type: lengte, breedte, wielstraal en wielbasis (ook gebruikt voor botsingen, parkeren en instappen).
const TYPES = {
  hatch: { L: 4.05, W: 1.76, wheelR: 0.31, wheelbase: 2.55 },
  sedan: { L: 4.65, W: 1.82, wheelR: 0.32, wheelbase: 2.8 },
  suv: { L: 4.43, W: 1.86, wheelR: 0.36, wheelbase: 2.7 },
  van: { L: 4.95, W: 1.95, wheelR: 0.34, wheelbase: 3.1 },
  sport: { L: 4.4, W: 1.88, wheelR: 0.33, wheelbase: 2.6, vmax: 36 },
  tractor: { L: 4.0, W: 2.2, wheelR: 0.75, wheelbase: 2.3, vmax: 11 },
  // de grijze Volvo XC40 van Ringweg 38: eigen model met de typische vormen en lampen
  xc40: { L: 4.43, W: 1.86, wheelR: 0.36, wheelbase: 2.7 },
};

const PAINTS = [0x2b2d30, 0xd8d9db, 0x8d9196, 0x1e2a44, 0x7a1e1e, 0xeeeeee, 0x3b4a3a, 0x6b6e72, 0x101012, 0x9c9fa3, 0x2f4f7a];

// Gebundelde (geparkeerde) auto's krijgen een model naar afstand tot de camera: vlakbij het volledige model,
// daarna een lichter model (nog met glas en interieur) en ver weg het eenvoudige. Op de telefoon alleen het eenvoudige.
// [detailniveau, afstand in meters, werpt schaduw]; de laatste trap geldt voor alles daarbuiten.
// Heel ver weg werpen de auto's geen schaduw meer: daar reikt de schaduwkaart toch niet, en het scheelt de helft van het werk.
const TIERS = Q.laag ? [[2, 70, true], [2, Infinity, false]]
  : Q.name === 'midden' ? [[1, 32, true], [2, 85, true], [2, Infinity, false]]
    : [[0, 13, true], [1, 50, true], [2, 100, true], [2, Infinity, false]];
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _col = new THREE.Color();

// lichtvlek op de weg voor de auto: plat vlak dat bij het beeld wordt opgeteld
let beamGeo = null;
function getBeamGeo() {
  if (beamGeo) return beamGeo;
  beamGeo = new THREE.PlaneGeometry(7.5, 15);
  beamGeo.rotateX(-Math.PI / 2); beamGeo.rotateY(Math.PI); // plat op de grond, bovenkant van de textuur ver weg
  beamGeo.translate(0, 0.05, 6.6);
  return beamGeo;
}

export class Vehicles {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.scene = game.scene;
    this.types = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { ...t }]));
    this.models = {}; // geometrie per type en detailniveau, pas gebouwd als hij nodig is
    this.mats = new CarMaterials();
    this.paintMat = this.mats.paintBase;
    this.detailMat = this.mats.detail;
    this.lightMat = this.mats.lightBase;
    this.cars = []; // alle auto's waar je in kunt stappen (dynamisch)
    this.traffic = [];
    this.night = 0;
    this.clock = 0;
    // één echte lamp voor de auto waarin de speler rijdt (niet op de telefoon); de rest krijgt een lichtvlek
    if (!Q.laag) {
      this.spot = new THREE.SpotLight(0xfff0dc, 0, 46, 0.62, 0.7, 1.5);
      this.spot.castShadow = false;
      this.scene.add(this.spot, this.spot.target);
    }
    // Schaduwvlek onder elke auto in de stand Laag. Daar is geen ambient occlusion en is de schaduwkaart te grof
    // om het donker onder een auto te laten zien, waardoor auto's boven de weg leken te zweven. Een zachte donkere
    // vlek op de grond (twee driehoeken per auto) zet ze weer op straat.
    if (Q.laag) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 128;
      const x = c.getContext('2d');
      // alleen de zachte slagschaduw van een rechthoek tekenen (de rechthoek zelf valt buiten het beeld):
      // dat werkt in elke browser, ook op oudere iPhones
      x.shadowColor = '#000'; x.shadowBlur = 10; x.shadowOffsetX = 200;
      x.fillStyle = '#000';
      x.fillRect(10 - 200, 12, 44, 104); // donker tot aan de rand van de auto, daarbuiten een halve meter uitloop
      const tex = new THREE.CanvasTexture(c);
      this.shadowMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });
      this.shadowGeos = {};
    }
  }

  // vlak onder de auto voor de schaduwvlek: iets groter dan de auto, net boven het wegdek
  shadowGeo(type) {
    return (this.shadowGeos[type] ??= (() => {
      const t = TYPES[type];
      const g = new THREE.PlaneGeometry(t.W + 1.0, t.L + 1.0);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.07, 0);
      return g;
    })());
  }

  // geometrie van een type op een detailniveau (0 = los en dichtbij, 1 = gebundeld dichtbij, 2 = ver weg / telefoon)
  model(type, lod) {
    return (this.models[type + lod] ??= buildCar(type, TYPES[type], lod));
  }

  // los, bestuurbaar automodel
  makeCarMesh(type, paint, car = null) {
    const lod = Q.laag ? 2 : Q.name === 'midden' && car?.ai ? 1 : 0;
    const m = this.model(type, lod);
    const g = new THREE.Group();
    const lm = this.mats.lights(car?.isVolvo ? 0 : 1 + Math.floor(Math.random() * (PLATE_COUNT - 1)));
    const baked = lod === 2; // eenvoudig model: wielen zitten vast in de details
    const body = new THREE.Mesh(m.paint, this.mats.paint(paint));
    const det = new THREE.Mesh(baked ? m.baked : m.detail, this.detailMat);
    const lig = new THREE.Mesh(m.lights, lm);
    body.castShadow = det.castShadow = true;
    body.receiveShadow = det.receiveShadow = true;
    g.add(body, det, lig); // de lak blijft het eerste kind (missies passen dat materiaal aan)
    const rig = { lamp: lm.userData.u.uLamp.value, wheels: [], dist: 0, steer: 0, on: 0, px: null, pz: null, ph: 0, pv: 0, done: null };
    if (m.glass) {
      const gl = new THREE.Mesh(m.glass, this.mats.glass);
      g.add(gl);
    }
    if (!baked) {
      // draaiende wielen: per soort wiel één gebundelde mesh
      m.wheelGeos.forEach((geo, gi) => {
        const list = m.wheels.filter((w) => w.geo === gi);
        const im = new THREE.InstancedMesh(geo, this.detailMat, list.length);
        im.castShadow = true; im.receiveShadow = true;
        rig.wheels.push({ im, list });
        g.add(im);
      });
      this.setWheels(rig);
      for (const w of rig.wheels) w.im.computeBoundingSphere();
      if (m.driverGeos) {
        rig.driver = new THREE.Mesh(m.driverGeos[0], this.detailMat);
        rig.driverGeos = m.driverGeos;
        rig.driver.visible = false;
        g.add(rig.driver);
      }
    }
    // lichtvlek van de koplampen op de weg (alleen zichtbaar als de lampen aan zijn en het donker is)
    rig.beam = new THREE.Mesh(getBeamGeo(), this.mats.beam);
    rig.beam.position.z = m.beam.z - 0.4;
    rig.beam.visible = false;
    g.add(rig.beam);
    if (this.shadowMat) { const sh = new THREE.Mesh(this.shadowGeo(type), this.shadowMat); sh.renderOrder = 1; g.add(sh); }
    g.userData.rig = rig;
    return g;
  }

  // wielen in de stand zetten: gedraaid om de as (afgelegde weg) en de voorwielen gestuurd
  setWheels(rig) {
    for (const grp of rig.wheels) {
      grp.list.forEach((w, i) => {
        const spin = rig.dist / w.r;
        _e.set(w.flip ? -spin : spin, (w.flip ? Math.PI : 0) + (w.steer ? -rig.steer : 0), 0, 'YXZ');
        _m.compose(_p.set(w.x, w.y, w.z), _q.setFromEuler(_e), _one);
        grp.im.setMatrixAt(i, _m);
      });
      grp.im.instanceMatrix.needsUpdate = true;
    }
    rig.done = rig.dist + rig.steer * 1000;
  }

  addCar(type, x, z, heading, paint, opts = {}) {
    const mesh = opts.parked ? null : this.makeCarMesh(type, paint, opts);
    if (mesh) this.scene.add(mesh);
    const car = { type, mesh, x, z, heading, speed: 0, steer: 0, paint, t: this.types[type], ...opts };
    this.unstick(car);
    if (mesh) this.placeCar(car);
    this.cars.push(car);
    return car;
  }

  // Een geparkeerde (gebundelde) auto omzetten naar een losse auto om in te rijden.
  activate(car) {
    if (car.mesh) return;
    car.mesh = this.makeCarMesh(car.type, car.paint, car);
    this.scene.add(car.mesh);
    car.parked = false;
    this.placeCar(car);
    this.refreshBatches(true); // uit de bundel halen
  }

  // Geparkeerde auto's verspreid over parkeervakken.
  spawnParked(extra = []) {
    // elke keer dat je speelt staan de auto's op andere plekken
    const rand = Math.random;
    const mobile = this.world.isMobile;
    const spots = this.world.parkingSpots.filter(() => rand() < (mobile ? 0.4 : 0.6));
    const max = mobile ? 55 : 120;
    const typeKeys = ['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'suv', 'van', 'sport'];
    const list = [];
    const pick = () => typeKeys[Math.floor(rand() * typeKeys.length)];
    const paint = () => PAINTS[Math.floor(rand() * PAINTS.length)];
    for (const s of spots.slice(0, max)) list.push(this.addCar(pick(), s.x, s.z, s.heading, paint(), { parked: true }));
    // auto's op opritten en erven door het hele dorp
    for (const d of this.drivewaySpots(mobile ? 40 : 90)) list.push(this.addCar(pick(), d.x, d.z, d.heading, paint(), { parked: true }));
    for (const e of extra) list.push(this.addCar(e.type, e.x, e.z, e.heading, e.paint, { parked: true, ...e.opts }));
    // Per type een bundel per afstandstrap. Elke bundel is per materiaal één tekenopdracht
    // (lak, details met de wielen, lampen en eventueel glas); lege bundels worden niet getekend.
    this.batches = {};
    const tmp = new THREE.Object3D();
    for (const type of Object.keys(TYPES)) {
      const cars = list.filter((c) => c.type === type);
      if (!cars.length) continue;
      const sphere = new THREE.Box3().setFromPoints(cars.map((c) => new THREE.Vector3(c.x, this.world.groundAt(c.x, c.z), c.z))).getBoundingSphere(new THREE.Sphere());
      sphere.radius += 6;
      const mk = ([lod, range, shadow]) => {
        const m = this.model(type, lod), n = cars.length;
        // eigen geometrie voor de lampen (zelfde gegevens), met per auto een kenteken
        const lg = new THREE.BufferGeometry();
        for (const k of Object.keys(m.lights.attributes)) lg.setAttribute(k, m.lights.attributes[k]);
        lg.setIndex(m.lights.index);
        const plate = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
        lg.setAttribute('aPlaat', plate);
        const meshes = [
          new THREE.InstancedMesh(m.paint, this.paintMat, n),
          new THREE.InstancedMesh(m.baked, this.detailMat, n),
          new THREE.InstancedMesh(lg, this.lightMat, n),
        ];
        meshes[0].castShadow = meshes[1].castShadow = shadow;
        meshes[0].receiveShadow = meshes[1].receiveShadow = true;
        if (m.glass) meshes.push(new THREE.InstancedMesh(m.glass, this.mats.glass, n));
        if (this.shadowMat) { const sh = new THREE.InstancedMesh(this.shadowGeo(type), this.shadowMat, n); sh.renderOrder = 1; meshes.push(sh); }
        meshes[0].setColorAt(0, _col.set(0xffffff));
        for (const im of meshes) { im.boundingSphere = sphere.clone(); im.count = 0; im.visible = false; this.scene.add(im); }
        return { lod, range, meshes, plate, n: 0 };
      };
      cars.forEach((c, i) => {
        c.slot = i;
        c.plate = c.isVolvo ? 0 : 1 + Math.floor(rand() * (PLATE_COUNT - 1));
        c.tier = TIERS.length - 1;
        this.pose(c, tmp);
        c.matrix = tmp.matrix.clone();
      });
      const sets = TIERS.map(mk);
      this.batches[type] = { cars, sets, meshes: sets.flatMap((q) => q.meshes) };
    }
    this.refreshBatches(true);
  }

  // Geparkeerde auto's over de bundels verdelen, naar afstand tot de camera.
  refreshBatches(force = false) {
    if (!this.batches) return;
    const cam = this.g.camera?.position;
    if (!force && cam && this.lodAt && cam.distanceToSquared(this.lodAt) < 4) return;
    if (cam) (this.lodAt ??= new THREE.Vector3()).copy(cam);
    this.batchDirty = false;
    for (const b of Object.values(this.batches)) {
      for (const set of b.sets) set.n = 0;
      for (const c of b.cars) {
        if (c.mesh) continue; // rijdt los rond
        let tier = b.sets.length - 1;
        if (cam && b.sets.length > 1) {
          const d = Math.hypot(c.x - cam.x, c.z - cam.z);
          for (let k = 0; k < b.sets.length; k++) {
            // een auto die al in een fijnere trap zit, blijft daar tot hij ruim buiten de grens is (geen geflikker op de rand)
            if (d < b.sets[k].range * (c.tier <= k ? 1.15 : 1)) { tier = k; break; }
          }
        }
        c.tier = tier;
        const set = b.sets[tier], i = set.n++;
        for (const im of set.meshes) im.setMatrixAt(i, c.matrix);
        set.meshes[0].setColorAt(i, _col.set(c.paint));
        set.plate.array[i] = c.plate;
      }
      for (const set of b.sets) {
        for (const im of set.meshes) { im.count = set.n; im.visible = set.n > 0; im.instanceMatrix.needsUpdate = true; }
        if (set.meshes[0].instanceColor) set.meshes[0].instanceColor.needsUpdate = true;
        set.plate.needsUpdate = true;
      }
    }
  }

    // Willekeurige opritten: tussen een huis en de straat, op verharding.
  drivewaySpots(n) {
    const w = this.world;
    const out = [];
    const ok = ['erf', 'verhard_open', 'klinkers', 'parkeer', 'verhard_gesloten'];
    for (let tries = 0; tries < n * 40 && out.length < n; tries++) {
      const f = w.footprints[Math.floor(Math.random() * w.footprints.length)];
      if (f.extra) continue;
      const area = (f.maxX - f.minX) * (f.maxZ - f.minZ);
      if (area < 60 || area > 900) continue; // gewone woonhuizen
      const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
      const st = w.nearestStreet(cx, cz);
      if (!st || st.dist > 35) continue;
      const [x, z] = w.spotNear(cx, cz);
      if (!ok.includes(w.classAt(x, z))) continue;
      const heading = Math.atan2(st.x - x, st.z - z);
      // genoeg ruimte voor een auto, en niet te dicht bij een andere
      const fx = Math.sin(heading), fz = Math.cos(heading);
      if (w.insideBuilding(x + fx * 2.3, z + fz * 2.3) || w.insideBuilding(x - fx * 2.3, z - fz * 2.3)) continue;
      if (w.classAt(x + fx * 2.3, z + fz * 2.3) === 'rijbaan') continue; // niet op de weg
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 8) || this.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) continue;
      out.push({ x, z, heading: heading + (Math.random() < 0.3 ? Math.PI : 0) });
    }
    return out;
  }

  // stand van een auto op het terrein berekenen
  pose(car, obj) {
    const { x, z, heading } = car;
    const L = car.t.L * 0.4, W = car.t.W * 0.45;
    const sx = Math.sin(heading), cz = Math.cos(heading);
    const px = cz, pz = -sx;
    const hF = this.world.groundAt(x + sx * L, z + cz * L);
    const hB = this.world.groundAt(x - sx * L, z - cz * L);
    const hL = this.world.groundAt(x + px * W, z + pz * W);
    const hR = this.world.groundAt(x - px * W, z - pz * W);
    const y = (hF + hB + hL + hR) / 4;
    obj.position.set(x, y, z);
    obj.rotation.order = 'YXZ';
    obj.rotation.set(-Math.atan2(hF - hB, L * 2), heading, Math.atan2(hL - hR, W * 2));
    obj.updateMatrix();
    car.y = y;
  }

  placeCar(car) {
    if (!car.mesh) {
      // geparkeerde auto die opzij geduwd wordt: in de bundel bijwerken
      if (car.slot == null || !this.batches) return;
      const tmp = new THREE.Object3D();
      this.pose(car, tmp);
      car.matrix.copy(tmp.matrix);
      this.batchDirty = true;
      return;
    }
    this.pose(car, car.mesh);
  }

  // auto uit gebouwen duwen (bij het neerzetten)
  unstick(car) {
    for (let it = 0; it < 6; it++) {
      let moved = false;
      for (const off of [car.t.L * 0.33, 0, -car.t.L * 0.33]) {
        const cx = car.x + Math.sin(car.heading) * off, cz = car.z + Math.cos(car.heading) * off;
        const [rx, rz] = this.world.resolve(cx, cz, car.t.W * 0.5);
        if (Math.abs(rx - cx) > 1e-3 || Math.abs(rz - cz) > 1e-3) { car.x += rx - cx; car.z += rz - cz; moved = true; }
      }
      if (!moved) break;
    }
  }

  nearestCar(x, z, maxD = 3.5) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z) - c.t.W * 0.5;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------ rijden

  drive(car, dt, throttle, steerIn, handbrake) {
    const w = this.world;
    // voor de lampen en de bestuurder: er wordt gereden, en of er geremd wordt
    car.driven = 0.3;
    car.braking2 = (throttle < -0.1 && car.speed > 0.4) || (throttle > 0.1 && car.speed < -0.4) || (!!handbrake && Math.abs(car.speed) > 0.4);
    const surface = w.classAt(car.x, car.z);
    const onRoad = ['rijbaan', 'klinkers', 'parkeer', 'erf', 'verhard_open', 'verhard_gesloten', 'brug', 'fietspad', 'voetpad', 'berm', 'oever', 'onverhard'].includes(surface);
    const top = car.t.vmax ?? 27; // ongeveer 100 km/u: genoeg voor een dorp
    // naast de weg (gras, akker) iets langzamer, maar nooit ineens: geleidelijk afremmen
    const vmax = onRoad || car.type === 'tractor' ? top : Math.min(top, 20);
    // optrekken wordt rustiger naarmate je harder gaat
    // remmen gaat flink harder dan optrekken
    const accel = throttle > 0 ? (car.speed < 0 ? 22 : 6.5 * (1 - 0.55 * Math.min(1, car.speed / top))) : throttle < 0 ? (car.speed > 0 ? 20 : 4.5) : 0;
    car.speed += throttle * accel * dt;
    if (!throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (onRoad ? 2.2 : 6) * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 16 * dt);
    // hard remmen: rookwolkjes bij de achterwielen en een piepend geluid
    const hardBrake = ((throttle < -0.35 && car.speed > 5) || (throttle > 0.35 && car.speed < -5) || (handbrake && Math.abs(car.speed) > 4)) && car.type !== 'tractor';
    if (hardBrake && this.g.fx) {
      car.smokeT = (car.smokeT || 0) - dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.05;
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading), sx = Math.cos(car.heading), sz = -Math.sin(car.heading);
        const back = -car.t.L * 0.33, y = (car.y ?? this.world.groundAt(car.x, car.z)) + 0.25;
        const k = Math.min(1.6, Math.abs(car.speed) / 12);
        for (const side of [-1, 1]) this.g.fx.smoke(car.x + fx * back + sx * side * car.t.W * 0.42, y, car.z + fz * back + sz * side * car.t.W * 0.42, 0.6 + k * 0.6);
      }
      if (!car.braking) { car.braking = true; this.g.sfx?.play('skid'); }
    } else car.braking = false;
    car.speed -= car.speed * Math.abs(car.speed) * 0.0009 * dt * 60 * (onRoad ? 1 : 2.5) * 0.02;
    if (car.speed > vmax) car.speed -= (car.speed - vmax) * Math.min(1, dt * 1.2);
    car.speed = THREE.MathUtils.clamp(car.speed, -8, top);

    // minder stuuruitslag op snelheid, en het stuur draait geleidelijk (geen schokken)
    const maxSteer = THREE.MathUtils.lerp(0.58, 0.075, Math.min(1, Math.abs(car.speed) / 26));
    car.steer += (steerIn * maxSteer - car.steer) * Math.min(1, dt * (steerIn ? 3.2 : 5));
    const yawRate = (car.speed * Math.tan(car.steer)) / car.t.wheelbase;
    car.heading -= yawRate * dt * (handbrake ? 1.6 : 1);

    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const front = car.t.L * 0.38 * Math.sign(car.speed || 1);
    // water blokkeert
    if (w.blocked(nx + Math.sin(car.heading) * front, nz + Math.cos(car.heading) * front)) {
      car.speed = 0; // stoppen voor het water, niet terugstuiteren
      return;
    }
    // botsingen met gebouwen: drie cirkels langs de auto
    let x = nx, z = nz, hit = false;
    for (const off of [car.t.L * 0.33, 0, -car.t.L * 0.33]) {
      const cx = x + Math.sin(car.heading) * off, cz = z + Math.cos(car.heading) * off;
      const [rx, rz] = w.resolve(cx, cz, car.t.W * 0.5);
      if (Math.abs(rx - cx) > 1e-4 || Math.abs(rz - cz) > 1e-4) { x += rx - cx; z += rz - cz; hit = true; }
    }
    // botsingen met andere auto's
    // elke auto als drie cirkels langs de lengteas: zo kun je netjes naast een andere auto parkeren
    const circles = (c, cx, cz) => [-0.33, 0, 0.33].map((k) => [cx + Math.sin(c.heading) * c.t.L * k, cz + Math.cos(c.heading) * c.t.L * k]);
    car.lastBump = null;
    for (const o of this.cars.concat(this.traffic)) {
      if (o === car) continue;
      if (Math.hypot(o.x - x, o.z - z) > car.t.L + o.t.L) continue;
      const rr = (o.t.W + car.t.W) * 0.5 + 0.05;
      for (const [ax, az] of circles(car, x, z)) for (const [bx, bz] of circles(o, o.x, o.z)) {
        const d = Math.hypot(ax - bx, az - bz);
        if (d >= rr || d < 0.001) continue;
        const push = (rr - d) / d;
        x += (ax - bx) * push * 0.6; z += (az - bz) * push * 0.6;
        if (!o.ai && !o.locked) { o.x -= (ax - bx) * push * 0.4; o.z -= (az - bz) * push * 0.4; this.placeCar(o); }
        hit = true;
        car.lastBump = o;
      }
    }
    car.bumpSpeed = hit ? Math.abs(car.speed) : 0;
    if (hit && Math.abs(car.speed) > 2) {
      car.speed *= 0.55;
      if (Math.abs(car.speed) > 8) { this.g.shake = 0.4; this.g.sfx?.play('crash'); }
    }
    car.x = x; car.z = z;
    this.placeCar(car);
  }

  // ------------------------------------------------------------ verkeer

  spawnTraffic(n, rnd = null) {
    const nodes = this.world.roadNodes;
    if (!nodes?.length) return;
    const rand = rnd || rng(99);
    const withEdges = nodes.map((nd, i) => i).filter((i) => nodes[i].edges.length);
    const typeKeys = ['hatch', 'sedan', 'suv', 'hatch', 'van'];
    for (let k = 0; k < n && withEdges.length; k++) {
      const from = withEdges[Math.floor(rand() * withEdges.length)];
      const edge = nodes[from].edges[Math.floor(rand() * nodes[from].edges.length)];
      const type = typeKeys[k % typeKeys.length];
      const mesh = this.makeCarMesh(type, PAINTS[Math.floor(rand() * PAINTS.length)], { ai: true });
      this.scene.add(mesh);
      const car = {
        ai: true, type, mesh, t: this.types[type], edge, dist: rand() * edge.len, x: 0, z: 0, heading: 0,
        speed: 0, cruise: 8 + rand() * 4, from,
      };
      this.traffic.push(car);
    }
  }

  updateTraffic(dt, player) {
    const nodes = this.world.roadNodes;
    for (const c of this.traffic) {
      // vertragen bij obstakels voor de auto
      let target = c.cruise;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const check = (o) => {
        if (o === c) return;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (dx * dx + dz * dz > 225) return;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(-dx * fz + dz * fx);
        if (ahead > 0 && ahead < 14 && side < 2.2) target = Math.min(target, Math.max(0, (ahead - 5) * 1.2));
      };
      check(player);
      // vlak naast of voor de auto staan: hij wacht (en dan kun je de chauffeur eruit trekken)
      const pd = Math.hypot(player.x - c.x, player.z - c.z);
      if (pd < 3.6) target = 0;
      if (pd < 7 && target === 0 && c.speed < 0.5) {
        c.blockT = (c.blockT || 0) + dt;
        if (c.blockT > 2.2) { c.blockT = -2.5; this.g.sfx?.play('honk'); }
      } else c.blockT = 0;
      for (let i = 0; i < this.cars.length; i++) check(this.cars[i]);
      for (let i = 0; i < this.traffic.length; i++) check(this.traffic[i]);
      // bochten langzamer
      c.speed += (target - c.speed) * Math.min(1, dt * (target < c.speed ? 4 : 1.2));
      c.dist += c.speed * dt;
      while (c.dist > c.edge.len) {
        c.dist -= c.edge.len;
        const node = nodes[c.edge.to];
        const options = node.edges.filter((e) => e.to !== c.from);
        const pick = options.length ? options[Math.floor(Math.random() * options.length)] : node.edges[0];
        c.from = c.edge.to;
        c.edge = pick;
      }
      const p = along(c.edge.pts, c.dist);
      // rechts houden
      const ox = Math.cos(p.heading) * -1.7, oz = -Math.sin(p.heading) * -1.7;
      const tx = p.x + ox, tz = p.z + oz;
      c.x += (tx - c.x) * Math.min(1, dt * 8);
      c.z += (tz - c.z) * Math.min(1, dt * 8);
      let dh = p.heading - c.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.heading += dh * Math.min(1, dt * 6);
      this.placeCar(c);
    }
    this.animate(dt);
  }

  // Elk beeld: wielen laten draaien en sturen, lampen (rem, achteruit, knipperlicht), bestuurder en lichtbundels.
  animate(dt) {
    this.clock += dt;
    const blinkOn = (this.clock * 1.4) % 1 < 0.5;
    let own = null;
    const each = (c) => {
      const rig = c.mesh?.userData.rig;
      if (!rig) return;
      const driven = c.driven > 0;
      // afgelegde weg langs de rijrichting sinds het vorige beeld
      if (rig.px != null) {
        const d = (c.x - rig.px) * Math.sin(c.heading) + (c.z - rig.pz) * Math.cos(c.heading);
        if (Math.abs(d) < 3) rig.dist += d;
      }
      let brake = false, reverse = false, blink = 0;
      if (c.ai) {
        // verkeer: stuurhoek uit de draaiing, remlicht bij afremmen en stilstaan, knipperlicht in de bocht
        let dh = c.heading - rig.ph;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const want = c.speed > 0.5 && dt > 0 ? THREE.MathUtils.clamp(-Math.atan(((dh / dt) * c.t.wheelbase) / Math.max(1.5, c.speed)), -0.5, 0.5) : 0;
        rig.steer += (want - rig.steer) * Math.min(1, dt * 5);
        if (Math.abs(rig.steer) < 1e-3) rig.steer = 0;
        brake = c.speed < 0.3 || (dt > 0 && (c.speed - rig.pv) / dt < -1.2);
        if (Math.abs(rig.steer) > 0.1 && blinkOn) blink = rig.steer < 0 ? 1 : -1;
      } else {
        rig.steer = THREE.MathUtils.clamp(c.steer || 0, -0.5, 0.5);
        brake = driven && !!c.braking2;
        reverse = driven && c.speed < -0.3;
        if (driven) own = c;
      }
      rig.px = c.x; rig.pz = c.z; rig.ph = c.heading; rig.pv = c.speed;
      // lampen: aan bij het verkeer en bij de auto waarin gereden wordt; de geparkeerde Volvo houdt 's avonds stadslicht
      const want = c.ai || driven ? 1 : c.isVolvo ? 0.3 * this.night : 0;
      rig.on += (want - rig.on) * Math.min(1, dt * 5);
      if (Math.abs(want - rig.on) < 0.01) rig.on = want;
      rig.lamp.set(rig.on, brake ? 1 : 0, reverse ? 1 : 0, blink);
      if (rig.beam) rig.beam.visible = rig.on > 0.6 && this.night > 0.05;
      if (rig.driver) {
        rig.driver.visible = !!c.ai || driven;
        const geo = rig.driverGeos[c.ai ? 0 : 1];
        if (rig.driver.geometry !== geo) rig.driver.geometry = geo;
      }
      if (rig.wheels.length && rig.done !== rig.dist + rig.steer * 1000) this.setWheels(rig);
      if (c.driven > 0) c.driven -= dt;
    };
    for (let i = 0; i < this.cars.length; i++) each(this.cars[i]);
    for (let i = 0; i < this.traffic.length; i++) each(this.traffic[i]);
    // de echte lamp schijnt vanaf de neus van de auto van de speler
    if (this.spot) {
      const k = own ? own.mesh.userData.rig.on * this.night : 0;
      this.spot.intensity = k * 55;
      if (own) {
        const fx = Math.sin(own.heading), fz = Math.cos(own.heading), y = own.y ?? 0;
        this.spot.position.set(own.x + fx * own.t.L * 0.45, y + (own.type === 'tractor' ? 1.5 : 0.8), own.z + fz * own.t.L * 0.45);
        this.spot.target.position.set(own.x + fx * 14, y - 0.6, own.z + fz * 14);
        this.spot.target.updateMatrixWorld();
      }
    }
    // bundels van geparkeerde auto's: af en toe opnieuw verdelen over dichtbij en ver weg
    this.lodT = (this.lodT || 0) - dt;
    if (this.batchDirty) this.refreshBatches(true);
    else if (this.lodT <= 0) { this.lodT = 0.25; this.refreshBatches(); }
  }

  // Een auto uit het verkeer halen (kapen): wordt een gewone auto om zelf in te rijden.
  hijack(c) {
    this.traffic = this.traffic.filter((x) => x !== c);
    c.ai = false; c.parked = false; c.speed = 0; c.steer = 0; c.hijacked = true;
    this.cars.push(c);
    // het verkeer weer aanvullen, ergens anders in het dorp
    this.spawnTraffic(1, Math.random);
    return c;
  }

  // Waar zit de chauffeur? (links voorin, in wereldcoördinaten)
  driverDoor(c) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    return [c.x + fx * 0.3 + lx * (c.t.W * 0.5 + 0.5), c.z + fz * 0.3 + lz * (c.t.W * 0.5 + 0.5)];
  }

  // stilstaand verkeer vlak bij de speler
  nearestTraffic(x, z, maxD = 3.4) {
    let best = null, bd = maxD;
    for (const c of this.traffic) {
      if (c.speed > 1.5) continue;
      const d = Math.hypot(c.x - x, c.z - z) - c.t.W * 0.5;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // 's avonds (t van 0 naar 1) gaan de lampen aan; hoe fel bepaalt het lampmateriaal per soort lamp
  setNight(t) {
    this.night = t;
    this.mats.nacht.value = t;
    this.mats.beam.opacity = 0.26 * t;
  }
}

function along(pts, dist) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= dist || i === pts.length - 1) {
      const t = seg ? Math.min(1, (dist - acc) / seg) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
    }
    acc += seg;
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}

export const VOLVO_GREY = 0x8e9296;
