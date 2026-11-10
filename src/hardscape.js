// Strakke bestrating: wegen, stoepen met echte stoepranden, fietspaden, parkeervakken,
// wegmarkering en water. Gebouwd als losse meshes die het terrein volgen.
import * as THREE from 'three';
import { Earcut } from 'three/src/extras/Earcut.js';
import { makeTextures } from './textures.js';
import { keepNormals } from './lighting.js';
import { Q } from './quality.js';

// klasse -> [texture, wereldmaat van één herhaling in meters, hoogte boven terrein, polygonOffset]
const LAYERS = {
  erf: ['erf', 1.26, 0.03, -1],
  verhard_open: ['erf', 1.26, 0.03, -1],
  verhard_gesloten: ['asfalt', 4, 0.03, -1],
  parkeer: ['parkeer', 1.68, 0.035, -2],
  klinkers: ['klinkers', 0.84, 0.04, -2],
  rijbaan: ['asfalt', 4, 0.04, -3],
  fietspad: ['fietspad', 4, 0.05, -4],
  voetpad: ['tegels', 1.2, 0.14, -5],
  brug: ['klinkers', 0.84, 0.12, -6],
};
const CURB_H = 0.14;

export function buildHardscape(world, scene) {
  const tx = makeTextures(world.isMobile);
  // fototexturen (Poly Haven) als die geladen zijn; de maat volgt de echte afmeting van de foto
  const layers = { ...LAYERS };
  const ph = world.photo?.ground;
  if (ph) {
    for (const k of ['asfalt', 'klinkers', 'tegels', 'parkeer']) tx[k] = { ...ph[k] };
    tx.erf = { ...ph.parkeer };
    // fietspad: rood asfalt
    tx.fietspad = { ...ph.asfalt, color: new THREE.Color(1.55, 0.62, 0.5) };
    for (const [cls, l] of Object.entries(layers)) layers[cls] = [l[0], ph[l[0]]?.size ?? (l[0] === 'erf' ? ph.parkeer.size : l[0] === 'fietspad' ? ph.asfalt.size : l[1]), l[2], l[3]];
  }
  const classes = world.ground.classes;
  const buckets = {};
  const curbs = [];
  const water = [];
  const maxEdge = world.isMobile ? 3.5 : 2.5;

  for (const [cls, rings] of world.ground.polys) {
    const name = classes[cls];
    if (name === 'water') { water.push(rings); continue; }
    const layer = LAYERS[name];
    if (!layer) continue;
    if (name === 'voetpad') { const sm = rings.map(smoothRing); (buckets[name] ||= []).push(sm); curbs.push(sm); continue; }
    (buckets[name] ||= []).push(rings);
  }

  const meshes = [];
  for (const [name, polys] of Object.entries(buckets)) {
    const [texName, size, lift, offset] = layers[name];
    const geo = drapePolys(world, polys, lift, size, maxEdge);
    if (!geo) continue;
    const t = tx[texName];
    const mat = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap || null, roughness: name === 'rijbaan' ? 0.88 : 0.82, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset * 2,
    });
    if (t.normalMap) mat.normalScale.set(0.8, 0.8);
    if (t.color) mat.color.copy(t.color);
    else if (texName === 'asfalt' && ph) mat.color.setScalar(1.3); // het schone asfalt is van zichzelf erg donker
    world.applyAO?.(mat);
    if (Q.natteWeg && world.applyAO) wetSurface(mat);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
    meshes.push(m);
  }

  // stoepranden: verticale randjes langs de stoepen
  const curbGeo = buildCurbs(world, curbs);
  if (curbGeo) {
    const m = new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({ map: tx.band.map, color: 0xd8d4cc, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
    m.receiveShadow = true;
    m.castShadow = false;
    keepNormals(m.material);
    scene.add(m);
  }

  // water
  const wgeo = drapePolys(world, water, 0.05, 6, maxEdge);
  let waterMat = null;
  if (wgeo) {
    const wn = waterNormals();
    // De Gulp en de vijvers: donker, helder water dat de lucht spiegelt (sterker naarmate je er vlakker overheen kijkt),
    // met twee lagen fijne rimpels die tegen elkaar in schuiven. De rimpels liggen in wereldmaten, dus overal even fijn.
    waterMat = new THREE.MeshStandardMaterial({
      color: 0x1d3530, roughness: 0.06, metalness: 0, normalMap: wn, envMapIntensity: 1.5,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    waterMat.userData.time = { value: 0 };
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterT = waterMat.userData.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWaterP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterP = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWaterP;\nuniform float uWaterT;')
        .replace('#include <normal_fragment_maps>', `
          {
            vec2 r1 = texture2D(normalMap, vWaterP * 0.42 + vec2(uWaterT * 0.035, uWaterT * 0.02)).xy * 2.0 - 1.0;
            vec2 r2 = texture2D(normalMap, vWaterP * 1.15 - vec2(uWaterT * 0.05, -uWaterT * 0.03)).xy * 2.0 - 1.0;
            vec2 rp = (r1 * 0.6 + r2 * 0.4) * 0.16;
            normal = normalize(mat3(viewMatrix) * normalize(vec3(rp.x, 1.0, rp.y)));
          }`);
    };
    const m = new THREE.Mesh(wgeo, waterMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // wegmarkering
  const marks = buildMarkings(world);
  if (marks) {
    const m = new THREE.Mesh(marks, new THREE.MeshStandardMaterial({
      color: 0xf2f0e8, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
    }));
    m.receiveShadow = true;
    keepNormals(m.material);
    scene.add(m);
  }

  return {
    update(dt) {
      if (waterMat) waterMat.userData.time.value += dt;
    },
  };
}

// ------------------------------------------------------------ geometrie

function drapePolys(world, polys, lift, uvSize, maxEdge) {
  const pos = [], nrm = [], uv = [];
  const n = new THREE.Vector3();
  const pushV = (x, z) => {
    const y = world.heightAt(x, z) + lift;
    pos.push(x, y, z);
    // normaal uit de hellingsgraad van het terrein
    const e = 1.5;
    const hx = world.heightAt(x + e, z) - world.heightAt(x - e, z);
    const hz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    n.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
    nrm.push(n.x, n.y, n.z);
    uv.push(x / uvSize, z / uvSize);
  };
  // adaptief verfijnen: alleen opdelen waar het terrein krom is of de driehoek erg groot
  const max2 = (maxEdge * 4) ** 2, min2 = maxEdge * maxEdge;
  const bends = (ax, az, bx, bz) => {
    const mid = world.heightAt((ax + bx) / 2, (az + bz) / 2);
    return Math.abs(mid - (world.heightAt(ax, az) + world.heightAt(bx, bz)) / 2) > 0.025;
  };
  const tri = (ax, az, bx, bz, cx, cz, depth) => {
    const ab = (ax - bx) ** 2 + (az - bz) ** 2;
    const bc = (bx - cx) ** 2 + (bz - cz) ** 2;
    const ca = (cx - ax) ** 2 + (cz - az) ** 2;
    const m = Math.max(ab, bc, ca);
    let split = m > max2;
    if (!split && m > min2) {
      split = m === ab ? bends(ax, az, bx, bz) : m === bc ? bends(bx, bz, cx, cz) : bends(cx, cz, ax, az);
      if (!split) {
        const gx = (ax + bx + cx) / 3, gz = (az + bz + cz) / 3;
        split = Math.abs(world.heightAt(gx, gz) - (world.heightAt(ax, az) + world.heightAt(bx, bz) + world.heightAt(cx, cz)) / 3) > 0.025;
      }
    }
    if (split && depth < 14) {
      if (m === ab) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        tri(ax, az, mx, mz, cx, cz, depth + 1); tri(mx, mz, bx, bz, cx, cz, depth + 1);
      } else if (m === bc) {
        const mx = (bx + cx) / 2, mz = (bz + cz) / 2;
        tri(ax, az, bx, bz, mx, mz, depth + 1); tri(ax, az, mx, mz, cx, cz, depth + 1);
      } else {
        const mx = (cx + ax) / 2, mz = (cz + az) / 2;
        tri(ax, az, bx, bz, mx, mz, depth + 1); tri(mx, mz, bx, bz, cx, cz, depth + 1);
      }
      return;
    }
    // driehoek met de klok mee gezien van boven (y omhoog, z naar het zuiden) => normaal omhoog
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross > 0) { pushV(ax, az); pushV(cx, cz); pushV(bx, bz); }
    else { pushV(ax, az); pushV(bx, bz); pushV(cx, cz); }
  };
  for (const rings of polys) {
    const flat = [], holes = [];
    for (const ring of rings) {
      if (flat.length) holes.push(flat.length / 2);
      // laatste punt is gelijk aan het eerste; overslaan
      const len = ring.length >= 4 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1] ? ring.length - 2 : ring.length;
      for (let i = 0; i < len; i++) flat.push(ring[i]);
    }
    const idx = Earcut.triangulate(flat, holes, 2);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 2, b = idx[i + 1] * 2, c = idx[i + 2] * 2;
      tri(flat[a], flat[a + 1], flat[b], flat[b + 1], flat[c], flat[c + 1], 0);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

// gladstrijken: eerst piepkleine uitstulpingen weg (Douglas-Peucker), dan hoeken afronden (Chaikin)
const simplify = (p, tol) => {
  if (p.length < 3) return p;
  const keep = new Array(p.length).fill(false); keep[0] = keep[p.length - 1] = true;
  const st = [[0, p.length - 1]];
  while (st.length) {
    const [i0, i1] = st.pop();
    const [ax, az] = p[i0], [bx, bz] = p[i1], L = Math.hypot(bx - ax, bz - az) || 1e-6;
    let best = -1, bd = 0;
    for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / L; if (d > bd) { bd = d; best = i; } }
    if (bd > tol) { keep[best] = true; st.push([i0, best], [best, i1]); }
  }
  return p.filter((_, i) => keep[i]);
};
const chaikin = (p, closed) => {
  if (p.length < 3) return p;
  const out = closed ? [] : [p[0]];
  const m = closed ? p.length : p.length - 1;
  for (let i = 0; i < m; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const f = Math.min(0.25, 0.6 / Math.max(L, 0.01)); // lange rechte stukken blijven recht, alleen de hoek wordt rond
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], [a[0] + (b[0] - a[0]) * (1 - f), a[1] + (b[1] - a[1]) * (1 - f)]);
  }
  if (!closed) out.push(p.at(-1));
  return out;
};

// Een stoepvlak gladstrijken: de kaart heeft punten op 10 cm afgerond, waardoor randen trapjes kregen.
// Dubbele punten weg, kleine trapjes eruit, en de hoeken licht afgerond. Gebruikt voor het vlak én de stoeprand.
function smoothRing(ring) {
  const pts = [];
  for (let i = 0; i < ring.length; i += 2) {
    const p = [ring[i], ring[i + 1]];
    if (!pts.length || Math.hypot(p[0] - pts.at(-1)[0], p[1] - pts.at(-1)[1]) > 0.01) pts.push(p);
  }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01) pts.pop();
  if (pts.length < 4) return ring;
  // Douglas-Peucker werkt op een open lijn: knip de ring bij het verste punt van het begin
  let far = 0, fd = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
  const A = simplify(pts.slice(0, far + 1), 0.13), B = simplify(pts.slice(far).concat([pts[0]]), 0.13);
  let q = A.concat(B.slice(1, -1));
  if (q.length < 3) return ring;
  q = chaikin(chaikin(q, true), true);
  const out = [];
  for (const p of q) out.push(p[0], p[1]);
  out.push(q[0][0], q[0][1]);
  return out;
}

// Stoepranden: alleen waar de stoep aan een lager vlak grenst (weg, parkeervak, fietspad, gras, erf).
// Geen randjes tussen twee stukken stoep of tegen een gevel. De rand volgt een gladgestreken lijn
// (kleine hoekjes uit de kaart eruit, hoeken afgerond) en heeft een echt profiel: voorkant, afgeronde
// bovenrand en een smal bovenvlak dat net over de stoep valt.
function buildCurbs(world, polys) {
  const chains = [];
  const side = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return 0;
    const nx = (bz - az) / len, nz = -(bx - ax) / len, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const d of [0.6, 0.9]) {
      const ca = world.classAt(mx + nx * d, mz + nz * d), cb = world.classAt(mx - nx * d, mz - nz * d);
      const low = (c) => c && c !== 'voetpad' && c !== 'brug' && !world.insideBuilding(mx - nx * d * Math.sign(c === cb ? 1 : -1), mz - nz * d * Math.sign(c === cb ? 1 : -1));
      if (ca === 'voetpad' && low(cb)) return 1; // stoep aan de kant van +n, ernaast iets lagers (weg, gras, erf)
      if (cb === 'voetpad' && low(ca)) return -1;
    }
    return 0;
  };
  for (const rings of polys) {
    for (const ring of rings) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
      if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01) pts.pop();
      const n = pts.length;
      if (n < 2) continue;
      const sides = pts.map((p, i) => side(p[0], p[1], pts[(i + 1) % n][0], pts[(i + 1) % n][1]));
      // ketens van opeenvolgende randen met dezelfde stoepkant
      let start = sides.findIndex((v, i) => v !== sides[(i - 1 + n) % n]);
      if (start < 0) { if (sides[0]) chains.push({ pts: pts.slice(), closed: true, s: sides[0] }); continue; }
      let cur = null;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (sides[i] && (!cur || cur.s !== sides[i])) { cur = { pts: [pts[i]], closed: false, s: sides[i] }; chains.push(cur); }
        if (!sides[i]) { cur = null; continue; }
        cur.pts.push(pts[(i + 1) % n]);
      }
    }
  }
  // profiel (dwars op de rand): [afstand naar de stoep toe, hoogte boven het maaiveld]
  const PROF = [[0, -0.06], [0, CURB_H - 0.035], [0.012, CURB_H - 0.012], [0.035, CURB_H + 0.004], [0.16, CURB_H + 0.006]];
  const pos = [], nrm = [], uv = [], idx = [];
  const maxSeg = 1.5;
  for (const c of chains) {
    let p = simplify(c.pts, 0.03);
    if (p.length < 2) continue;
    // lange stukken opdelen zodat de rand het terrein volgt
    const q = [];
    const m = c.closed ? p.length : p.length - 1;
    for (let i = 0; i < m; i++) {
      const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(L / maxSeg));
      for (let j = 0; j < k; j++) q.push([a[0] + (b[0] - a[0]) * (j / k), a[1] + (b[1] - a[1]) * (j / k)]);
    }
    if (!c.closed) q.push(p.at(-1)); else q.push(q[0]);
    if (q.length < 2) continue;
    // per punt een gemiddelde richting, zodat de rand vloeiend doorloopt (geen knikken in het licht)
    const N = q.length, base = pos.length / 3;
    let along = 0;
    for (let i = 0; i < N; i++) {
      const pa = q[Math.max(0, i - 1)], pb = q[Math.min(N - 1, i + 1)];
      let tx = pb[0] - pa[0], tz = pb[1] - pa[1];
      if (c.closed && (i === 0 || i === N - 1)) { tx = q[1][0] - q[N - 2][0]; tz = q[1][1] - q[N - 2][1]; }
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      // naar de stoep toe: de stoepkant van de oorspronkelijke ring
      const ix = tz * c.s, iz = -tx * c.s;
      if (i) along += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      const g = world.heightAt(q[i][0], q[i][1]);
      for (let k = 0; k < PROF.length; k++) {
        const [o, h] = PROF[k];
        pos.push(q[i][0] + ix * o, g + h, q[i][1] + iz * o);
        // normaal: voorkant naar de weg, bovenvlak omhoog, de afronding ertussenin
        const up = k <= 1 ? 0 : k === 2 ? 0.55 : k === 3 ? 0.9 : 1;
        const out = Math.sqrt(1 - up * up);
        nrm.push(-ix * out, up, -iz * out);
        uv.push(along / 1.0, k / (PROF.length - 1));
      }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < PROF.length - 1; k++) {
      const a = base + i * PROF.length + k, b = a + PROF.length;
      if (c.s > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// Witte middenstreep op wegen die breed genoeg zijn.
function buildMarkings(world) {
  const pos = [];
  const dash = 3, gap = 9, w = 0.12;
  for (const [name, ax, az, bx, bz] of world.segments) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 4) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const px = -dz, pz = dx;
    for (let s = 1; s + dash < len; s += dash + gap) {
      const cx = ax + dx * (s + dash / 2), cz = az + dz * (s + dash / 2);
      if (world.classAt(cx, cz) !== 'rijbaan') continue;
      if (world.classAt(cx + px * 2.8, cz + pz * 2.8) !== 'rijbaan' || world.classAt(cx - px * 2.8, cz - pz * 2.8) !== 'rijbaan') continue;
      const x0 = ax + dx * s, z0 = az + dz * s, x1 = ax + dx * (s + dash), z1 = az + dz * (s + dash);
      const h0 = world.heightAt(x0, z0) + 0.06, h1 = world.heightAt(x1, z1) + 0.06;
      const q = [
        [x0 + px * w, h0, z0 + pz * w], [x0 - px * w, h0, z0 - pz * w], [x1 - px * w, h1, z1 - pz * w],
        [x0 + px * w, h0, z0 + pz * w], [x1 - px * w, h1, z1 - pz * w], [x1 + px * w, h1, z1 + pz * w],
      ];
      for (const v of q) pos.push(...v);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nn = new Float32Array(pos.length);
  for (let i = 1; i < nn.length; i += 3) nn[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return geo;
}

function waterNormals() {
  // naadloos herhalende rimpels: een som van golfjes in willekeurige richtingen (hele golfgetallen = naadloos)
  const size = 256;
  const waves = [];
  let sd = 4711;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 18; i++) {
    const kx = Math.round((rnd() - 0.5) * 14), ky = Math.round((rnd() - 0.5) * 14);
    if (!kx && !ky) continue;
    waves.push([kx, ky, rnd() * Math.PI * 2, 1 / Math.hypot(kx, ky)]);
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      let dx = 0, dy = 0;
      for (const [kx, ky, ph, a] of waves) { const cs = Math.cos(kx * u + ky * v + ph) * a; dx += cs * kx; dy += cs * ky; }
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, (dx * 0.16 + 0.5) * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, (dy * 0.16 + 0.5) * 255));
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Natte straat ('s avonds, na een bui): het wegdek wordt donkerder en glanst, in de plassen spiegelt de lucht,
// en elke lantaarn krijgt een lange lichtveeg op het natte wegdek. Die veeg is een echte spiegeling: voor elk
// punt op de weg wordt uitgerekend welke lantaarn daar in de spiegel zou staan (via de lichtkaart uit lighting.js).
function wetSurface(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        float wetH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wetN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wetH(i), wetH(i + vec2(1, 0)), f.x), mix(wetH(i + vec2(0, 1)), wetH(i + vec2(1, 1)), f.x), f.y); }
        // drie lagen ruis, elke laag gedraaid en verschoven: grillige vormen zonder zichtbaar raster
        float wetF(vec2 p){
          const mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
          float s = wetN(p) * 0.52; p = R * p * 2.07 + 13.7;
          s += wetN(p) * 0.3; p = R * p * 2.13 + 4.1;
          return s + wetN(p) * 0.18;
        }
        float wetPud = 0.0; float wetAmt = 0.0;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // grote vlekken in het wegdek (slijtage, oude reparaties), zodat een lange straat geen egaal vlak is
        diffuseColor.rgb *= 0.9 + 0.14 * wetN(vAOxz * 0.085) + 0.08 * wetN(vAOxz * 0.6);
        #ifdef LOCALS_LAMPS
          wetAmt = texelFetch(uGlobals, ivec2(0, 0), 0).y;
          if (wetAmt > 0.01) {
            // Plassen: kleine, grillige vormen (één tot een paar meter), geen grote strakke vlakken. De vorm wordt eerst
            // vervormd, de waterrand volgt de korrel van het asfalt, en rond elke plas ligt een natte, donkere rand.
            vec2 pq = vAOxz * 0.33;
            pq += (vec2(wetN(pq * 0.9 + 31.7), wetN(pq * 0.9 + 77.3)) - 0.5) * 1.6;
            float pd = wetF(pq) - 0.63 + (wetN(vAOxz * 9.0) - 0.5) * 0.03;
            float wetRim = smoothstep(-0.11, 0.0, pd) * wetAmt;
            wetPud = smoothstep(0.0, 0.04, pd) * wetAmt;
            roughnessFactor = mix(mix(mix(roughnessFactor, 0.45, wetAmt * 0.6), 0.24, wetRim * 0.8), 0.05, wetPud);
            diffuseColor.rgb *= mix(1.0, 0.7, wetAmt) * mix(1.0, 0.86, wetRim) * mix(1.0, 0.78, wetPud);
          }
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, wetPud * 0.92));`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // In een straat spiegelt een plas vooral gevels en bomen (donker), niet de lichte lucht bij de horizon:
        // hoe vlakker je over het water kijkt, hoe minder lucht erin spiegelt. Recht van boven zie je de lucht wel.
        if (wetPud > 0.0) {
          float wetRy = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix).y;
          reflectedLight.indirectSpecular *= mix(1.0, mix(0.22, 0.9, smoothstep(0.12, 0.65, wetRy)), wetPud);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef LOCALS_LAMPS
          if (wetAmt > 0.01) {
            vec4 wetG = texelFetch(uGlobals, ivec2(0, 0), 0);
            if (wetG.x > 0.01) {
              mat3 wV2W = transpose(mat3(viewMatrix));
              vec3 wP = cameraPosition + wV2W * (-vViewPosition);
              float camH = max(0.3, cameraPosition.y - wP.y);
              vec2 wQ = cameraPosition.xz + (wP.xz - cameraPosition.xz) * (camH + 5.85) / camH;
              vec4 wBox = texelFetch(uGlobals, ivec2(1, 0), 0);
              ivec2 wTS = textureSize(uLampMap, 0);
              wTS.x /= 2; // rechterhelft van de kaart: per vakje de dichtstbijzijnde lantaarn
              vec3 wR = reflect(normalize(wP - cameraPosition), vec3(0.0, 1.0, 0.0));
              // De lichtveeg van een lantaarn is lang: hij loopt meters door voor en achter de plek waar de lamp precies
              // in de spiegel staat. Daarom wordt langs de kijkrichting op vijf plekken gekeken welke lantaarn daar het
              // dichtst bij staat, en telt de lamp die het best in de spiegel staat. Ver voor of achter die plek dooft de
              // veeg geleidelijk uit. (Met één plek brak de veeg af op de rand van een kaartvakje: harde, getrapte randen.)
              vec2 wAlong = normalize(wR.xz + 1e-5);
              float wPow = mix(380.0, 1600.0, wetPud), wBest = 0.0;
              for (int wk = 0; wk < 5; wk++) {
                vec2 wUV = (wQ + wAlong * (float(wk) - 2.0) * 10.0 - wBox.xy) / wBox.zw;
                if (wUV.x > 0.0 && wUV.x < 1.0 && wUV.y > 0.0 && wUV.y < 1.0) {
                  ivec2 wTC = ivec2(wUV * vec2(wTS));
                  vec4 wL = texelFetch(uLampMap, wTC + ivec2(wTS.x, 0), 0);
                  if (wL.a > 0.0) {
                    vec2 wCen = wBox.xy + (vec2(wTC) + 0.5) / vec2(wTS) * wBox.zw;
                    vec3 wLp = vec3(wCen.x + wL.x, wL.z, wCen.y + wL.y);
                    float wFade = 1.0 - smoothstep(18.0, 26.0, abs(dot(wLp.xz - wQ, wAlong)));
                    wBest = max(wBest, pow(max(dot(wR, normalize(wLp - wP)), 0.0), wPow) * wL.a * wFade);
                  }
                }
              }
              totalEmissiveRadiance += vec3(1.0, 0.74, 0.46) * (wBest * wetG.x * (0.5 * wetAmt + 3.0 * wetPud));
            }
          }
        #endif`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => 'wet' + (key ? key() : '');
}

// Hoogte van het loopoppervlak (stoepen liggen iets hoger dan de weg).
export function surfaceLift(world, x, z) {
  const c = world.classAt(x, z);
  if (c === 'voetpad') return CURB_H;
  if (c === 'brug') return 0.12;
  return 0;
}
