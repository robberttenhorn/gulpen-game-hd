// Beelden in Gulpen, op hun plek. Beschrijvingen uit de beeldendatabase van Van der Krogt (via zoekresultaten);
// plekken uit de BGT (kunstobject/herdenkingsmonument) of, waar dat niet bekend is, een benadering op het genoemde plein.
// De vormen zijn vereenvoudigd nagemaakt; het zijn geen exacte kopieën.
import * as THREE from 'three';

const bronze = () => new THREE.MeshStandardMaterial({ color: 0x5b4a36, metalness: 0.65, roughness: 0.42 });
const stoneMat = (c = 0xb9b4aa) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m; };

function plinth(g, w, h, d, mat = stoneMat(0x9e9a92)) {
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), 0, h / 2, 0));
  return h;
}

// staafje (capsule) van punt a naar punt b
function seg(m, a, b, r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, d.length() - r), 5, 10), m);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// Paard in brons (busstation): een steigerend paard op een sokkel
function paard() {
  const g = new THREE.Group();
  const y0 = plinth(g, 1.2, 0.9, 2.1);
  const m = bronze();
  const h = new THREE.Group();
  h.position.y = y0;
  // achterbenen op de sokkel, romp schuin omhoog
  for (const x of [-0.16, 0.16]) {
    h.add(seg(m, [x, 0.05, -0.3], [x, 0.48, -0.62], 0.07)); // onderbeen
    h.add(seg(m, [x, 0.48, -0.62], [x, 1.02, -0.42], 0.12)); // dij
    h.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 8), m).translateX(x).translateY(0.04).translateZ(-0.28)); // hoef
  }
  h.add(seg(m, [0, 1.08, -0.6], [0, 1.6, 0.55], 0.31)); // romp
  h.add(seg(m, [0, 1.72, 0.6], [0, 2.25, 0.86], 0.16)); // hals
  h.add(seg(m, [0, 2.3, 0.82], [0, 2.08, 1.28], 0.12)); // hoofd
  h.add(seg(m, [0, 2.12, 1.2], [0, 2.02, 1.34], 0.09)); // snuit
  for (const x of [-0.06, 0.06]) h.add(seg(m, [x, 2.35, 0.82], [x, 2.52, 0.78], 0.03)); // oren
  h.add(seg(m, [0, 2.32, 0.74], [0, 1.82, 0.5], 0.06)); // manen
  // voorbenen opgetrokken
  for (const [x, k] of [[-0.15, 0], [0.15, 0.1]]) {
    h.add(seg(m, [x, 1.45, 0.62], [x, 1.55 + k, 0.98], 0.08));
    h.add(seg(m, [x, 1.55 + k, 0.98], [x, 1.18 + k, 1.08], 0.06));
  }
  // staart tot op de sokkel (zoals vaak bij steigerende paarden: een extra steunpunt)
  h.add(seg(m, [0, 1.15, -0.85], [0, 0.55, -1.0], 0.08));
  h.add(seg(m, [0, 0.55, -1.0], [0, 0.05, -0.92], 0.1));
  h.traverse((o) => { o.castShadow = true; });
  g.add(h);
  return { g, r: 1.2 };
}

// Smeltkroes van de evolutie (Deken Schneidersstraat): granieten druppel van 3,5 m, met vissen die vogels worden
function druppel() {
  const g = new THREE.Group();
  const H = 3.5, R = 0.95, pts = [];
  // druppelvorm: rond aan de onderkant, spits aan de bovenkant
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI; // 0 = onder, PI = boven
    const y = (H * (1 - Math.cos(t))) / 2;
    const r = R * Math.sin(t) * Math.pow(Math.cos(t / 2), 1.3) * 1.25;
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  // spikkelig graniet
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const n = Math.sin(i * 12.9898) * 43758.5453; const f = n - Math.floor(n);
    const v = 0.2 + f * 0.16; col[i * 3] = v * 1.08; col[i * 3 + 1] = v * 0.97; col[i * 3 + 2] = v * 0.95;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.add(at(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 })), 0, 0.12, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.12, 24), stoneMat(0x6f6b65)), 0, 0.06, 0));
  const rAt = (y) => { const t = Math.acos(1 - (2 * (y - 0.12)) / H); return R * Math.sin(t) * Math.pow(Math.cos(t / 2), 1.3) * 1.25; };
  // reliëf: onderin vissen, naar boven toe vogels
  const relief = new THREE.MeshStandardMaterial({ color: 0x4a4541, roughness: 0.4 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, y = 0.75 + (k % 2) * 0.35, rr = rAt(y);
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6), relief); fish.scale.set(1.7, 0.55, 0.3);
    g.add(at(fish, Math.sin(a) * rr, y, Math.cos(a) * rr, 0, a + Math.PI / 2, 0.25));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 3), relief); tail.scale.z = 0.3;
    g.add(at(tail, Math.sin(a - 0.3) * rr, y + 0.05, Math.cos(a - 0.3) * rr, 0, a, Math.PI / 2));
    const b = a + 0.4, yb = 1.9 + (k % 3) * 0.3, rb = rAt(yb) + 0.02;
    const bird = new THREE.Group();
    bird.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.07), relief), -0.12, 0.04, 0, 0, 0, 0.4), at(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.07), relief), 0.12, 0.04, 0, 0, 0, -0.4));
    g.add(at(bird, Math.sin(b) * rb, yb, Math.cos(b) * rb, Math.PI / 2, b, 0));
  }
  return { g, r: 1.1 };
}

// Sint Jozef (Kapelaan Pendersplein): stenen beeld van Jozef met een kind
function jozef() {
  const g = new THREE.Group();
  const y0 = plinth(g, 0.9, 1.0, 0.9, stoneMat(0x8f8b84));
  const s = stoneMat(0xcfcac0);
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 1.5, 12), s), 0, y0 + 0.75, 0)); // mantel
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), s), 0, y0 + 1.68, 0)); // hoofd
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10), s), 0, y0 + 1.48, 0.08, -0.3)); // baard
  g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), s), 0.24, y0 + 1.15, 0.12, -0.6, 0, -0.3)); // arm om het kind
  // kind naast hem
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.7, 10), s), 0.32, y0 + 0.35, 0.18));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), s), 0.32, y0 + 0.8, 0.18));
  return { g, r: 0.65 };
}

// De Limburger (Markt): een figuur op een ton, met drie gezichten
function limburger() {
  const g = new THREE.Group();
  const y0 = plinth(g, 1.1, 0.35, 1.1, stoneMat(0x8f8b84));
  const m = bronze();
  // ton met hoepels
  const ton = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.85, 18), m);
  g.add(at(ton, 0, y0 + 0.43, 0));
  const ring = new THREE.MeshStandardMaterial({ color: 0x3d3125, metalness: 0.7, roughness: 0.4 });
  for (const y of [0.12, 0.43, 0.74]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.025, 6, 24), ring), 0, y0 + y, 0, Math.PI / 2));
  // zittende figuur
  const yb = y0 + 0.86;
  g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 6, 10), m), 0, yb + 0.45, 0)); // romp
  for (const x of [-0.12, 0.12]) {
    g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 8), m), x, yb + 0.1, 0.24, Math.PI / 2)); // bovenbeen
    g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), m), x, yb - 0.2, 0.46)); // onderbeen
    g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 8), m), x * 2.3, yb + 0.5, 0.1, 0.4)); // armen
  }
  // hoofd met drie gezichten (rondom, elk een neus en ogen)
  const head = new THREE.Group();
  head.position.set(0, yb + 1.0, 0);
  head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), m), 0, 0, 0));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    head.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), m), Math.sin(a) * 0.2, -0.02, Math.cos(a) * 0.2, Math.PI / 2, 0, -a));
    for (const s of [-1, 1]) { const b = a + s * 0.35; head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), ring), Math.sin(b) * 0.185, 0.05, Math.cos(b) * 0.185)); }
  }
  g.add(head);
  return { g, r: 0.75 };
}

// Twee Stromen (Arthur Spronken, 1992), bij de Gulp tegenover Café Neubourg: twee krachtige bogen
// (de samenvloeiing van Gulp en Geul) met daarvoor een bronzen torso die lijkt te bewegen
function tweeStromen() {
  const g = new THREE.Group();
  const m = bronze();
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3c2c, metalness: 0.6, roughness: 0.5 });
  // twee bogen die elkaar kruisen, elk iets anders gedraaid en van een andere grootte
  const arc = (R, t, mat, x, ry) => { const a = new THREE.Mesh(new THREE.TorusGeometry(R, t, 10, 40, Math.PI), mat); a.scale.z = 1.6; return at(a, x, 0, 0, 0, ry, 0); };
  g.add(arc(1.75, 0.2, m, -0.35, 0.28));
  g.add(arc(1.35, 0.17, dark, 0.45, -0.32));
  // voetstukken van de bogen
  const feet = [];
  for (const [R, x, ry] of [[1.75, -0.35, 0.28], [1.35, 0.45, -0.32]]) for (const s of [-1, 1]) {
    const fx = x + Math.cos(ry) * R * s, fz = -Math.sin(ry) * R * s;
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.6), stoneMat(0x8a857d)), fx, 0.06, fz, 0, ry, 0));
    feet.push([fx, fz, 0.35]);
  }
  // torso op een lage sokkel, voor de bogen, schuin gedraaid alsof hij in beweging is
  const t = new THREE.Group();
  t.position.set(0.1, 0, 1.6);
  t.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), stoneMat(0x8a857d)), 0, 0.35, 0));
  const body = new THREE.Group(); body.position.y = 0.7; body.rotation.set(0.12, 0.5, -0.15); t.add(body);
  body.add(seg(m, [0, 0.05, 0], [0, 0.55, 0.02], 0.2)); // buik en heupen
  body.add(seg(m, [0, 0.55, 0.02], [0, 0.95, 0.06], 0.25)); // borst
  body.add(seg(m, [-0.28, 0.95, 0.04], [0.28, 0.98, 0.08], 0.13)); // schouders
  body.add(seg(m, [0.32, 0.95, 0.06], [0.42, 0.75, 0.2], 0.08)); // armstomp
  body.add(seg(m, [-0.32, 0.93, 0.02], [-0.4, 1.12, -0.05], 0.08)); // armstomp omhoog
  body.add(seg(m, [0, 1.05, 0.06], [0, 1.2, 0.08], 0.08)); // hals
  g.add(t);
  feet.push([0.1, 1.6, 0.45]);
  return { g, r: 0, feet };
}

// Zet de beelden neer. pois: id -> poi; artPts: punten uit de BGT.
export function buildStatues(fac) {
  const w = fac.world;
  const placed = [];
  const put = (make, x, z, yaw, name) => {
    // niet op de rijbaan en niet in een pand
    const o = w.offRoad ? w.offRoad(x, z, 4) : [x, z];
    if (!o) return;
    [x, z] = o;
    const { g, r, feet } = make();
    g.position.set(x, w.groundAt(x, z), z);
    g.rotation.y = yaw;
    fac.scene.add(g);
    const circle = (cx, cz, rr) => { const ring = []; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ring.push([cx + Math.sin(a) * rr, cz + Math.cos(a) * rr]); } w.addObstacle(ring); };
    if (feet) { const c = Math.cos(yaw), sn = Math.sin(yaw); for (const [fx, fz, rr] of feet) circle(x + fx * c + fz * sn, z - fx * sn + fz * c, rr); }
    else circle(x, z, r);
    placed.push({ name, x, z, yaw });
  };
  const faceStreet = (x, z) => { const s = w.nearestStreet(x, z); return s ? Math.atan2(s.x - x, s.z - z) : 0; };
  // BGT-punten (kunstobject/herdenkingsmonument): Rijksweg bij het busstation en de Deken Schneidersstraat
  put(paard, 250.6, -54.6, faceStreet(250.6, -54.6), 'Paard in brons');
  put(druppel, 85.5, 51.3, faceStreet(85.5, 51.3), 'Smeltkroes van de evolutie');
  // vrije plek voor een gevel: 'out' meter van de gevel af, zo dicht mogelijk bij het midden ervan
  const bad = new Set(['rijbaan', 'fietspad', 'parkeer', 'water']);
  const freeAt = (x, z, r) => {
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI * 2, px = x + (k ? Math.sin(a) * r : 0), pz = z + (k ? Math.cos(a) * r : 0);
      if (w.insideBuilding(px, pz) || w.blocked(px, pz) || bad.has(w.classAt(px, pz))) return false;
    }
    if ((w.planterSpots || []).some(([px, pz]) => Math.hypot(px - x, pz - z) < r + 1.2)) return false;
    if ((w.benchSpots || []).some((b) => Math.hypot(b.x - x, b.z - z) < r + 1.2)) return false;
    return true;
  };
  const before = (f, outs, r) => {
    if (!f) return null;
    for (const out of outs) for (const along of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const x = f.x + f.nx * out + f.ux * along, z = f.z + f.nz * out + f.uz * along;
      if (freeAt(x, z, r)) return [x, z];
    }
    return null;
  };
  // Sint Jozef: op het Kapelaan Pendersplein, recht voor Donny's Gezellerie, tussen het terras en de straat
  // (het terras reikt tot ruim 4,5 m van de gevel). Lukt dat niet, dan midden op het plein zoals voorheen.
  const dn = fac.frames.donnys;
  const jz = before(dn, [6.5, 7, 6, 7.5, 8, 5.6], 1.0);
  if (jz) put(jozef, jz[0], jz[1], Math.atan2(dn.nx, dn.nz), 'Sint Jozef');
  else {
    const kp = w.streetPath?.('Kapelaan Pendersplein');
    if (kp?.length) { const cx = kp.reduce((t, q) => t + q[0], 0) / kp.length, cz = kp.reduce((t, q) => t + q[1], 0) / kp.length; put(jozef, cx, cz, faceStreet(cx, cz), 'Sint Jozef'); }
  }
  // De Limburger: op de Markt, recht voor Herberg De Zwarte Ruiter (voorbij het terras)
  const zr = fac.frames.zwarteruiter;
  const pl = before(zr, [8.5, 9, 9.5, 10, 11], 1.1);
  if (pl) put(limburger, pl[0], pl[1], Math.atan2(zr.nx, zr.nz), 'De Limburger');
  // Twee Stromen: tegenover Café Neubourg, aan de kant van de Gulp
  const nb = fac.frames.neubourg;
  const ts = before(nb, [8, 8.5, 9, 7.5, 9.5, 10, 7], 2.0);
  if (ts) put(tweeStromen, ts[0], ts[1], Math.atan2(nb.nx, nb.nz) + Math.PI, 'Twee Stromen');
  fac.statues = placed;
  return placed;
}
