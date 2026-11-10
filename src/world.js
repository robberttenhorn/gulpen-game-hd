// Bouwt de 3D-wereld van Gulpen op uit de open data in public/data/.
import * as THREE from 'three';
import { buildVegetation, buildPlanters } from './vegetation.js';
import { buildHardscape, surfaceLift } from './hardscape.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setLampMap, setLampGlobals, keepNormals } from './lighting.js';
import { Q } from './quality.js';

const DATA = import.meta.env.BASE_URL + 'data/';
// versienummer van deze build achter elk databestand: nieuwe code krijgt nooit een oud (bewaard) bestand
const V = typeof __BUILD__ !== 'undefined' ? `?v=${__BUILD__}` : '';

async function fetchJson(name) {
  const r = await fetch(DATA + name + V);
  if (!r.ok) throw new Error(`Kan ${name} niet laden`);
  return r.json();
}
function loadTexture(name) {
  return new Promise((res) => new THREE.TextureLoader().load(DATA + name + V, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.anisotropy = 8;
    res(t);
  }, undefined, () => res(null)));
}
// Fototexturen (Poly Haven, CC0): muren en daken als één texture-array voor de gevelshader,
// bestrating als losse texturen.
const WALL_LAYERS = ['pleister', 'mergel', 'baksteen_rood', 'baksteen_bruin', 'baksteen_geel', 'grijs', 'leien', 'pannen_rood', 'pannen_antraciet', 'bitumen'];
async function loadImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('kan ' + url + ' niet laden');
  return createImageBitmap(await r.blob());
}
async function loadPhotoTextures(isMobile) {
  const meta = await fetchJson('tex/tex.json');
  const sfx = isMobile ? '_m' : '';
  const S = isMobile ? 512 : 1024, SN = S / 2;
  const toArray = async (kind, size, srgb) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const data = new Uint8Array(size * size * 4 * WALL_LAYERS.length);
    const avg = [];
    const imgs = await Promise.all(WALL_LAYERS.map((n) => loadImage(`${DATA}tex/${meta[n].id}_${kind}${sfx}.jpg${V}`)));
    imgs.forEach((img, i) => {
      ctx.drawImage(img, 0, 0, size, size);
      const px = ctx.getImageData(0, 0, size, size).data;
      data.set(px, i * size * size * 4);
      // gemiddelde helderheid (lineair), voor het mengen met de luchtfoto op daken
      let sum = 0;
      for (let k = 0; k < px.length; k += 64) sum += Math.pow(px[k] / 255, 2.2) * 0.3 + Math.pow(px[k + 1] / 255, 2.2) * 0.55 + Math.pow(px[k + 2] / 255, 2.2) * 0.15;
      avg.push(sum / (px.length / 64));
    });
    const t = new THREE.DataArrayTexture(data, size, size, WALL_LAYERS.length);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return { t, avg };
  };
  const [d, n] = await Promise.all([toArray('d', S, true), toArray('n', SN, false)]);
  const ground = {};
  await Promise.all(['asfalt', 'klinkers', 'tegels', 'parkeer'].map(async (k) => {
    const [map, normalMap] = await Promise.all([loadTexture(`tex/${meta[k].id}_d${sfx}.jpg`), loadTexture(`tex/${meta[k].id}_n${sfx}.jpg`)]);
    for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = true; }
    normalMap.colorSpace = THREE.NoColorSpace;
    ground[k] = { map, normalMap, size: meta[k].size };
  }));
  return { meta, wallD: d.t, wallN: n.t, avg: d.avg, sizes: WALL_LAYERS.map((k) => meta[k].size), ground };
}
async function fetchBin(name) {
  const r = await fetch(DATA + name + V).catch(() => null);
  if (r && r.ok) return r.arrayBuffer();
  // sommige hostings serveren geen .bin; dan staat er een base64-versie naast
  const t = await fetch(DATA + name + '.b64.txt' + V);
  if (!t.ok) throw new Error(`Kan ${name} niet laden`);
  const bin = atob((await t.text()).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Deterministische random, zodat Gulpen er bij iedereen hetzelfde uitziet.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(scene, onProgress) {
    this.scene = scene;
    this.onProgress = onProgress || (() => {});
    this.nightUniform = { value: 0 };
  }

  async load(isMobile) {
    this.isMobile = isMobile;
    const step = (p, t) => this.onProgress(p, t);
    step(0.02, 'Kaartgegevens laden...');
    this.meta = await fetchJson('meta.json');
    // luchtfoto's (PDOK, Beeldmateriaal Nederland) alvast laden
    const photoP = loadPhotoTextures(isMobile).catch((e) => { console.warn('texturen', e); return null; });
    const orthoP = Promise.all([loadTexture(isMobile ? 'ortho-core-m.jpg' : 'ortho-core.jpg'), loadTexture('ortho-wide.jpg')]);
    const [coreBuf, wideBuf] = await Promise.all([fetchBin('terrain-core.bin'), fetchBin('terrain-wide.bin')]);
    this.coreRaw = new Float32Array(coreBuf);
    this.wideRaw = new Float32Array(wideBuf);
    this.setupTerrainGrids();

    step(0.12, 'Wegen, water en groen tekenen...');
    this.ground = await fetchJson('ground.json');
    this.buildGroundTexture();

    step(0.3, 'Het Heuvelland vormen...');
    const [orthoCore, orthoWide] = await orthoP;
    this.setupOrtho(orthoCore, orthoWide);
    this.buildTerrainMeshes();

    step(0.45, '1.872 huizen neerzetten...');
    const [bBuf, footprints, photo] = await Promise.all([fetchBin('buildings.bin'), fetchJson('footprints.json'), photoP]);
    this.photo = photo;
    this.buildBuildings(bBuf);
    if (!Q.laag) { try { this.buildRoofTrim(); } catch (e) { console.warn('dakranden', e); } }
    this.setupCollision(footprints);
    if (!Q.laag) { try { this.buildChimneys(); } catch (e) { console.warn('schoorstenen', e); } }
    this.paintBuilding([190985.6, 314375.8]); // Ringweg 38 (RD-coördinaten): roodbruine baksteen
    this.buildAO();

    step(0.7, 'Bomen planten...');
    this.objects = await fetchJson('objects.json');
    this.roads = await fetchJson('roads.json');
    this.buildStreetIndex();
    await this.buildTrees();
    this.buildProps();
    // struiken, hagen, graspollen, bloemen en bloembakken op de Markt
    try { this.vegetation = buildVegetation(this); this.planters = buildPlanters(this, this.spotNear(20, 0)); } catch (e) { console.warn('begroeiing', e); }

    step(0.85, 'Stoepen en straten leggen...');
    this.hardscape = buildHardscape(this, this.scene);
    this.buildParking();
    this.buildRoadGraph();
    step(0.95, 'Bijna klaar...');
  }

  // hoogte van het loopoppervlak, inclusief stoepranden
  groundAt(x, z) {
    return this.heightAt(x, z) + surfaceLift(this, x, z);
  }

  // water is niet begaanbaar (bruggen wel)
  // Alleen echt water houdt je tegen: smalle sloten, greppels en randjes (minder dan ~2,5 m breed) niet.
  blocked(x, z) {
    if (this.classAt(x, z) !== 'water') return false;
    const e = 1.2;
    return this.classAt(x + e, z) === 'water' && this.classAt(x - e, z) === 'water'
      && this.classAt(x, z + e) === 'water' && this.classAt(x, z - e) === 'water';
  }

  // Parkeervakken: rijen plekken in de BGT-parkeervlakken.
  buildParking() {
    const classes = this.ground.classes;
    const spots = [];
    const rand = rng(4040);
    let lot = -1;
    for (const [cls, rings] of this.ground.polys) {
      if (classes[cls] !== 'parkeer') continue;
      lot++; // elk parkeervlak een eigen nummer, zodat een missie op één parkeerplaats kan blijven
      const r = rings[0];
      // langste zijde bepaalt de richting
      let best = 0, ang = 0;
      for (let i = 0; i < r.length - 2; i += 2) {
        const l = Math.hypot(r[i + 2] - r[i], r[i + 3] - r[i + 1]);
        if (l > best) { best = l; ang = Math.atan2(r[i + 2] - r[i], r[i + 3] - r[i + 1]); }
      }
      if (best < 5) continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < r.length; i += 2) {
        minX = Math.min(minX, r[i]); maxX = Math.max(maxX, r[i]);
        minZ = Math.min(minZ, r[i + 1]); maxZ = Math.max(maxZ, r[i + 1]);
      }
      const ring = [];
      for (let i = 0; i < r.length; i += 2) ring.push([r[i], r[i + 1]]);
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const px = -dz, pz = dx;
      // raster van 2,6 x 5 m langs de lange zijde
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      const ext = Math.hypot(maxX - minX, maxZ - minZ) / 2;
      for (let a = -ext; a <= ext; a += 2.6) {
        for (let b = -ext; b <= ext; b += 5.5) {
          const x = cx + dx * a + px * b, z = cz + dz * a + pz * b;
          if (!pointInRing(x, z, ring)) continue;
          if (!pointInRing(x + px * 2.2, z + pz * 2.2, ring) || !pointInRing(x - px * 2.2, z - pz * 2.2, ring)) continue;
          if (this.insideBuilding(x, z)) continue;
          spots.push({ x, z, heading: Math.atan2(px, pz) + (rand() < 0.5 ? Math.PI : 0), r: rand(), lot });
        }
      }
    }
    this.parkingSpots = spots;
  }

  // Wegennet voor verkeer: knooppunten en verbindingen op berijdbare wegen.
  buildRoadGraph() {
    const nodes = [];
    const key = (x, z) => Math.round(x) + ',' + Math.round(z);
    const index = new Map();
    const nodeAt = (x, z) => {
      const k = key(x, z);
      if (index.has(k)) return index.get(k);
      // ook naburige afrondingen proberen
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k2 = key(x + ox, z + oz);
        if (index.has(k2)) return index.get(k2);
      }
      const id = nodes.length;
      nodes.push({ x, z, edges: [] });
      index.set(k, id);
      return id;
    };
    const drivable = (c) => c === 'rijbaan' || c === 'klinkers' || c === 'parkeer' || c === 'verhard_gesloten';
    for (const [name, line] of this.roads) {
      if (/voetpad|fietspad/i.test(name)) continue;
      const pts = [];
      for (let i = 0; i < line.length; i += 2) pts.push([line[i], line[i + 1]]);
      if (pts.length < 2) continue;
      // berijdbaar als het midden van de meeste stukjes op rijbaan ligt
      let ok = 0, tot = 0;
      for (let i = 1; i < pts.length; i++) {
        const mx = (pts[i][0] + pts[i - 1][0]) / 2, mz = (pts[i][1] + pts[i - 1][1]) / 2;
        tot++; if (drivable(this.classAt(mx, mz))) ok++;
      }
      if (ok / tot < 0.6) continue;
      const a = nodeAt(pts[0][0], pts[0][1]), b = nodeAt(pts.at(-1)[0], pts.at(-1)[1]);
      if (a === b) continue;
      const len = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      nodes[a].edges.push({ to: b, pts, len, name });
      nodes[b].edges.push({ to: a, pts: pts.slice().reverse(), len, name });
    }
    this.roadNodes = nodes;
  }

  // ------------------------------------------------------------ terrein

  setupTerrainGrids() {
    const { core, wide, origin } = this.meta;
    // lokale coördinaten: x = oost - origin.x, z = origin.y - noord
    this.coreBox = {
      x0: core.minX - origin.x, x1: core.maxX - origin.x,
      z0: origin.y - core.maxY, z1: origin.y - core.minY,
    };
    this.wideBox = {
      x0: wide.minX - origin.x, x1: wide.maxX - origin.x,
      z0: origin.y - wide.maxY, z1: origin.y - wide.minY,
    };

    // Speelbare hoogtekaart op 4 m (gemiddelde van 2x2 cellen van 2 m), past precies bij het mesh.
    const f = 2;
    this.gridRes = core.res * f;
    this.gw = Math.floor(core.w / f);
    this.gh = Math.floor(core.h / f);
    this.grid = new Float32Array(this.gw * this.gh);
    for (let r = 0; r < this.gh; r++) {
      for (let c = 0; c < this.gw; c++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += this.coreRaw[(r * f + dy) * core.w + c * f + dx];
        this.grid[r * this.gw + c] = s / (f * f);
      }
    }
    this.baseHeight = this.grid[Math.floor(this.gh / 2) * this.gw + Math.floor(this.gw / 2)];
  }

  // hoogte in wereldcoördinaten (y) op lokale x,z
  heightAt(x, z) {
    const b = this.coreBox;
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
      const gx = (x - b.x0) / this.gridRes - 0.5;
      const gz = (z - b.z0) / this.gridRes - 0.5;
      return this.bilinear(this.grid, this.gw, this.gh, gx, gz) - this.baseHeight;
    }
    const w = this.wideBox;
    const res = this.meta.wide.res;
    const gx = (x - w.x0) / res - 0.5;
    const gz = (z - w.z0) / res - 0.5;
    return this.bilinear(this.wideRaw, this.meta.wide.w, this.meta.wide.h, gx, gz) - this.baseHeight;
  }

  bilinear(a, w, h, gx, gz) {
    gx = Math.max(0, Math.min(w - 1.001, gx));
    gz = Math.max(0, Math.min(h - 1.001, gz));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const i = z0 * w + x0;
    const a00 = a[i], a10 = a[i + 1], a01 = a[i + w], a11 = a[i + w + 1];
    return (a00 * (1 - fx) + a10 * fx) * (1 - fz) + (a01 * (1 - fx) + a11 * fx) * fz;
  }

  // Luchtfoto als ondergrond voor groen en akkers, en als kleur voor de daken.
  setupOrtho(core, wide) {
    const { origin: o, core: c, wide: w } = this.meta;
    const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    dummy.needsUpdate = true;
    this.ortho = {
      uOrtho: { value: core || dummy },
      uOrthoBox: { value: new THREE.Vector4(c.minX - o.x, -(c.maxY - o.y), c.maxX - c.minX, c.maxY - c.minY) },
      uOrthoOn: { value: core ? 1 : 0 },
      uAO: { value: dummy },
    };
    this.orthoWide = wide;
    this.wideOrthoBox = [w.minX - o.x, -(w.maxY - o.y), w.maxX - w.minX, w.maxY - w.minY];
  }

  // Eén pand een vast gevelmateriaal geven (btype 2 = muur met vaste baksteen).
  paintBuilding(rd) {
    const o = this.meta.origin;
    const x = rd[0] - o.x, z = -(rd[1] - o.y);
    let fp = null;
    for (const i of this.nearbyFootprints(x, z)) if (pointInRing(x, z, this.footprints[i].ring)) fp = this.footprints[i];
    if (!fp) return;
    const { f32, i8, n, stride, ib } = this.bld;
    const ring = fp.ring;
    // afstand van een punt tot de rand van het pand
    const edgeDist = (px, pz) => {
      let best = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
        best = Math.min(best, Math.hypot(px - ax - dx * t, pz - az - dz * t));
      }
      return best;
    };
    let painted = 0;
    for (let v = 0; v < n; v += 3) {
      if (i8[v * stride + 23] !== 0) continue; // alleen muren
      const cx = (f32[v * 7] + f32[(v + 1) * 7] + f32[(v + 2) * 7]) / 3, cz = (f32[v * 7 + 2] + f32[(v + 1) * 7 + 2] + f32[(v + 2) * 7 + 2]) / 3;
      if (cx < fp.minX - 0.5 || cx > fp.maxX + 0.5 || cz < fp.minZ - 0.5 || cz > fp.maxZ + 0.5) continue;
      if (!pointInRing(cx, cz, ring) && edgeDist(cx, cz) > 0.25) continue;
      for (let k = 0; k < 3; k++) i8[(v + k) * stride + 23] = 2;
      painted++;
    }
    ib.needsUpdate = true;
    return painted;
  }

  // Zachte schaduw op de grond langs muren (ambient occlusion), vooraf berekend uit de gebouwvlakken.
  // Werkt ook op telefoons: het is gewoon een extra grijswaardenkaart.
  buildAO() {
    const b = this.coreBox;
    const res = 1; // pixels per meter
    const W = Math.round((b.x1 - b.x0) * res), H = Math.round((b.z1 - b.z0) * res);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    for (const f of this.footprints) {
      if (f.extra) continue;
      ctx.beginPath();
      f.ring.forEach(([x, z], i) => { const px = (x - b.x0) * res, py = (z - b.z0) * res; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fill();
    }
    const src = ctx.getImageData(0, 0, W, H).data;
    let a = new Float32Array(W * H), t = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = src[i * 4] / 255;
    const inside = a.map((v) => (v < 0.5 ? 1 : 0));
    // drie keer een vervaging: bijna gaussisch, ongeveer 2 meter breed
    const r = 2;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < H; y++) {
        let acc = 0; const row = y * W;
        for (let x = -r; x <= r; x++) acc += a[row + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) {
          t[row + x] = acc / (2 * r + 1);
          acc += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += t[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) {
          a[y * W + x] = acc / (2 * r + 1);
          acc += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x];
        }
      }
    }
    const out = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = inside[i] ? 255 : Math.round(255 * Math.min(1, 0.35 + a[i] * 0.65 + (1 - a[i]) * 0.0));
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(out, W, H);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.ortho.uAO.value = tex;
  }

  // Zelfde schaduwkaart op andere materialen (stoepen, wegen) zetten.
  applyAO(mat) {
    const ortho = this.ortho, prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev?.call(mat, shader, r);
      shader.uniforms.uAO = ortho.uAO;
      shader.uniforms.uOrthoBox = ortho.uOrthoBox;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vAOxz;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAOxz = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vAOxz;\nuniform sampler2D uAO;\nuniform vec4 uOrthoBox;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(uAO, (vAOxz - uOrthoBox.xy) / uOrthoBox.zw).r;');
    };
    mat.customProgramCacheKey = () => 'ao' + (prev ? prev.toString().length : 0);
  }

  buildGroundTexture() {
    const b = this.coreBox;
    const W = b.x1 - b.x0, H = b.z1 - b.z0;
    const maxTex = this.isMobile ? 3072 : 4096;
    const cw = maxTex;
    const ch = Math.round((maxTex * H) / W);
    const scale = cw / W;
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');

    const colors = {
      gras: '#7c9d4c', akker: '#b5a46a', bos: '#4c7536', struiken: '#66853f', erf: '#a49d8e',
      verhard_open: '#a19a8f', verhard_gesloten: '#8c8b88', onverhard: '#a99470', berm: '#83a253',
      oever: '#6f9450', water: '#4d7d96', voetpad: '#bdb2a1', fietspad: '#a35a4c', parkeer: '#8d8984',
      rijbaan: '#56585c', klinkers: '#8e8178', brug: '#918d88', spoor_zand: '#c2b08a', fruit: '#86a24c',
    };
    ctx.fillStyle = colors.gras;
    ctx.fillRect(0, 0, cw, ch);
    const classes = this.ground.classes;
    // klassen-kaart voor later (bomen in bos, water, enz.)
    this.classCanvas = document.createElement('canvas');
    const cs = 1; // 1 px per meter
    this.classCanvas.width = Math.round(W * cs);
    this.classCanvas.height = Math.round(H * cs);
    const cctx = this.classCanvas.getContext('2d');
    cctx.fillStyle = 'rgb(0,0,0)';
    cctx.fillRect(0, 0, this.classCanvas.width, this.classCanvas.height);

    for (const [cls, rings] of this.ground.polys) {
      const name = classes[cls];
      ctx.fillStyle = colors[name] || colors.gras;
      ctx.beginPath();
      cctx.fillStyle = `rgb(${cls + 1},0,0)`;
      cctx.beginPath();
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const px = (ring[i] - b.x0) * scale, py = (ring[i + 1] - b.z0) * scale;
          const qx = (ring[i] - b.x0) * cs, qy = (ring[i + 1] - b.z0) * cs;
          if (i === 0) { ctx.moveTo(px, py); cctx.moveTo(qx, qy); } else { ctx.lineTo(px, py); cctx.lineTo(qx, qy); }
        }
        ctx.closePath(); cctx.closePath();
      }
      ctx.fill('evenodd');
      cctx.fill('evenodd');
      // subtiele randjes langs stoepen en wegen
      if (name === 'voetpad' || name === 'rijbaan' || name === 'fietspad') {
        ctx.strokeStyle = 'rgba(40,40,40,0.25)';
        ctx.lineWidth = Math.max(1, scale * 0.15);
        ctx.stroke();
      }
    }
    // De klassenkaart (wat is weg, stoep, water...) exact rasteren zonder vloeiende randen.
    // Vloeiende randen gaven losse 'water'-pixels op grenzen tussen vlakken, waar je dan op vastliep.
    this.classGrid = rasterClasses(this.ground.polys, this.classCanvas.width, this.classCanvas.height, b.x0, b.z0, cs);
    this.classScale = cs;

    // korrelige ruis voor detail
    const img = ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    const rand = rng(1825);
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 18;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);

    this.groundCanvas = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.groundTexture = tex;
  }

  classAt(x, z) {
    const b = this.coreBox;
    const px = Math.floor((x - b.x0) * this.classScale);
    const py = Math.floor((z - b.z0) * this.classScale);
    if (px < 0 || py < 0 || px >= this.classCanvas.width || py >= this.classCanvas.height) return null;
    const v = this.classGrid[py * this.classCanvas.width + px];
    return v === 0 ? 'gras' : this.ground.classes[v - 1];
  }

  buildTerrainMeshes() {
    const b = this.coreBox;
    const gw = this.gw, gh = this.gh, res = this.gridRes;
    const pos = new Float32Array(gw * gh * 3);
    const uv = new Float32Array(gw * gh * 2);
    for (let r = 0; r < gh; r++) {
      for (let c = 0; c < gw; c++) {
        const i = r * gw + c;
        const x = b.x0 + (c + 0.5) * res, z = b.z0 + (r + 0.5) * res;
        pos[i * 3] = x;
        pos[i * 3 + 1] = this.grid[i] - this.baseHeight;
        pos[i * 3 + 2] = z;
        uv[i * 2] = (x - b.x0) / (b.x1 - b.x0);
        uv[i * 2 + 1] = (z - b.z0) / (b.z1 - b.z0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // Water: het terrein heeft een raster van 4 meter en steekt daardoor hier en daar net boven het wateroppervlak
    // uit (groene vlekken in de beek en de vijvers). Elk rasterpunt in of vlak bij water krijgt een merkje; de shader
    // tekent het terrein daar op dezelfde plek, maar zet het voor de dieptetest een eind naar achteren. Het water
    // wint daar dus altijd van de grond eronder, zonder dat de hoogte van het terrein (en waar je loopt) verandert.
    const wet = new Float32Array(gw * gh);
    for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
      const x = pos[(r * gw + c) * 3], z = pos[(r * gw + c) * 3 + 2];
      let w = this.classAt(x, z) === 'water';
      for (let k = 0; k < 16 && !w; k++) { const a = (k / 8) * Math.PI * 2, d = k < 8 ? 2.2 : 4.4; w = this.classAt(x + Math.sin(a) * d, z + Math.cos(a) * d) === 'water'; }
      wet[r * gw + c] = w ? 1 : 0;
    }
    geo.setAttribute('aWater', new THREE.BufferAttribute(wet, 1));
    geo.setIndex(gridIndex(gw, gh));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: 0.95, metalness: 0 });
    const ortho = this.ortho;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, ortho);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorld;\nattribute float aWater;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = position.xz;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          if (aWater > 0.0) {
            // alleen de diepte opschuiven (9 meter verder weg langs de kijkrichting), niet de plek in beeld
            float zv = mvPosition.z - 9.0 * aWater;
            gl_Position.z = gl_Position.w * (projectionMatrix[2][2] * zv + projectionMatrix[3][2]) / (-zv);
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          #define GRASS_SHADE ${Q.gras ? '0.8' : '1.0'}
          varying vec2 vWorld;
          uniform sampler2D uOrtho;
          uniform vec4 uOrthoBox;
          uniform float uOrthoOn;
          uniform sampler2D uAO;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y);
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
            float sat = (mx - mn) / (mx + 1e-4);
            float paved = 1.0 - smoothstep(0.12, 0.3, sat);
            float green = smoothstep(0.0, 0.05, c.g - c.r) * (1.0 - paved);
            // klinkers / tegels
            vec2 q = vWorld / vec2(0.22, 0.11);
            q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
            vec2 fq = fract(q);
            vec2 w = fwidth(q);
            float fadeP = 1.0 - smoothstep(0.25, 0.6, max(w.x, w.y));
            float joint = smoothstep(0.0, 0.08 + w.x, fq.x) * smoothstep(0.0, 0.12 + w.y, fq.y);
            float stone = 0.9 + gh(floor(q)) * 0.2;
            float asphalt = step(mx, 0.12);
            float pave = mix(1.0, mix(0.82, 1.0, joint) * stone, fadeP * paved * (1.0 - asphalt));
            // asfaltkorrel
            float grit = mix(1.0, 0.9 + gh(floor(vWorld * 12.0)) * 0.2, asphalt * paved * fadeP);
            // grasvlekken
            float gn = vnoise(vWorld * 0.35) * 0.6 + vnoise(vWorld * 1.7) * 0.4;
            float grass = mix(1.0, 0.8 + gn * 0.4, green);
            float fine = vnoise(vWorld * 7.0) * 0.5 + vnoise(vWorld * 23.0) * 0.5;
            float blade = mix(1.0, 0.88 + fine * 0.24, green * (1.0 - smoothstep(0.3, 1.2, fwidth(vWorld.x * 23.0))));
            diffuseColor.rgb *= pave * grit * grass * blade;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 1.08, 0.9), green * (gn - 0.5));
            // groen, akkers en bos: de echte luchtfoto, met fijne grasruis voor dichtbij
            vec3 oc = texture2D(uOrtho, (vWorld - uOrthoBox.xy) / uOrthoBox.zw).rgb;
            oc = mix(vec3(dot(oc, vec3(0.3, 0.55, 0.15))), oc, 1.12) * 1.12;
            float soft = (1.0 - paved) * uOrthoOn;
            diffuseColor.rgb = mix(diffuseColor.rgb, oc * blade * mix(1.0, 0.92 + fine * 0.16, green), soft);
            // dichtbij staat er echt gras op (grass.js): de grond eronder iets donkerder, als de schaduw tussen de sprieten
            diffuseColor.rgb *= mix(1.0, GRASS_SHADE, green * soft * (1.0 - smoothstep(20.0, 32.0, distance(vWorld, cameraPosition.xz))));
            diffuseColor.rgb *= texture2D(uAO, (vWorld - uOrthoBox.xy) / uOrthoBox.zw).r;
          }`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.coreMesh = mesh;

    // Groot terrein rondom: het Heuvelland met akkers en bosranden.
    const { w, h, res: wres } = this.meta.wide;
    const wb = this.wideBox;
    // elke tweede rasterpunt is genoeg voor de horizon
    const st = 2, W2 = Math.floor((w - 1) / st) + 1, H2 = Math.floor((h - 1) / st) + 1;
    const wpos = new Float32Array(W2 * H2 * 3);
    const wcol = new Float32Array(W2 * H2 * 3);
    const rand = rng(1999);
    const fieldColors = [
      [0.42, 0.56, 0.25], [0.5, 0.6, 0.28], [0.64, 0.6, 0.36], [0.36, 0.5, 0.22], [0.55, 0.62, 0.3], [0.7, 0.64, 0.4],
    ].map((c) => c.map((v) => Math.pow(v, 2.2)));
    const fieldHash = (x, z) => {
      const fx = Math.floor((x + 13) / 140), fz = Math.floor((z + 7) / 90);
      const hsh = Math.abs(Math.sin(fx * 127.1 + fz * 311.7) * 43758.5453) % 1;
      return fieldColors[Math.floor(hsh * fieldColors.length)];
    };
    const shrink = 30;
    for (let rr = 0; rr < H2; rr++) {
      for (let cc = 0; cc < W2; cc++) {
        const r = rr * st, c = cc * st;
        const i = rr * W2 + cc;
        const x = wb.x0 + (c + 0.5) * wres, z = wb.z0 + (r + 0.5) * wres;
        let y = this.wideRaw[r * w + c] - this.baseHeight;
        const inside = x > b.x0 + shrink && x < b.x1 - shrink && z > b.z0 + shrink && z < b.z1 - shrink;
        if (inside) y -= 4;
        wpos[i * 3] = x; wpos[i * 3 + 1] = y; wpos[i * 3 + 2] = z;
        // helling bepalen
        const hl = this.wideRaw[r * w + Math.max(0, c - 1)], hr = this.wideRaw[r * w + Math.min(w - 1, c + 1)];
        const hu = this.wideRaw[Math.max(0, r - 1) * w + c], hd = this.wideRaw[Math.min(h - 1, r + 1) * w + c];
        const slope = Math.hypot(hr - hl, hd - hu) / (2 * wres);
        let col = fieldHash(x, z);
        if (slope > 0.12) col = [0.07, 0.15, 0.05];
        else if (slope > 0.08) col = [0.12, 0.22, 0.07];
        const n = 0.9 + rand() * 0.2;
        wcol[i * 3] = col[0] * n; wcol[i * 3 + 1] = col[1] * n; wcol[i * 3 + 2] = col[2] * n;
      }
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    // luchtfoto van het Heuvelland eromheen
    const [ox0, oz0, oW, oH] = this.wideOrthoBox;
    const wuv = new Float32Array(W2 * H2 * 2);
    for (let i = 0; i < W2 * H2; i++) { wuv[i * 2] = (wpos[i * 3] - ox0) / oW; wuv[i * 2 + 1] = (wpos[i * 3 + 2] - oz0) / oH; }
    wgeo.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
    wgeo.setIndex(gridIndex(W2, H2));
    wgeo.computeVertexNormals();
    const wmat = this.orthoWide
      ? new THREE.MeshStandardMaterial({ map: this.orthoWide, roughness: 1, color: 0xf2f2f2 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const wmesh = new THREE.Mesh(wgeo, wmat);
    wmesh.receiveShadow = false;
    this.scene.add(wmesh);

    this.buildHillForest();
  }

  // Bomen op de steile hellingen buiten het dorp, zodat de horizon echt Heuvelland is.
  buildHillForest() {
    const { w, h, res } = this.meta.wide;
    const wb = this.wideBox, b = this.coreBox;
    const pts = [];
    const rand = rng(156);
    for (let r = 1; r < h - 1; r++) {
      for (let c = 1; c < w - 1; c++) {
        const x = wb.x0 + (c + 0.5) * res, z = wb.z0 + (r + 0.5) * res;
        if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) continue;
        const hl = this.wideRaw[r * w + c - 1], hr = this.wideRaw[r * w + c + 1];
        const hu = this.wideRaw[(r - 1) * w + c], hd = this.wideRaw[(r + 1) * w + c];
        const slope = Math.hypot(hr - hl, hd - hu) / (2 * res);
        if (slope > 0.08 && rand() < (this.isMobile ? 0.18 : 0.35)) {
          pts.push([x + (rand() - 0.5) * res, z + (rand() - 0.5) * res, 0.8 + rand() * 0.8]);
        }
      }
    }
    const geo = new THREE.ConeGeometry(5.5, 15, 5, 1);
    geo.translate(0, 6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 1, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    pts.forEach(([x, z, sc], i) => {
      p.set(x, this.heightAt(x, z) - 4 * 0, z);
      // wide terrein ligt rond de kern lager; gebruik de ruwe brede hoogte
      p.y = this.bilinear(this.wideRaw, w, h, (x - wb.x0) / res - 0.5, (z - wb.z0) / res - 0.5) - this.baseHeight - 1;
      s.set(sc * 1.4, sc, sc * 1.4);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      col.setHSL(0.27 + rand() * 0.06, 0.4, 0.17 + rand() * 0.08);
      inst.setColorAt(i, col);
    });
    this.scene.add(inst);
  }

  // ------------------------------------------------------------ gebouwen

  buildBuildings(buf) {
    const stride = 28;
    const n = buf.byteLength / stride;
    const f32 = new Float32Array(buf);
    const i8 = new Int8Array(buf);
    const u8 = new Uint8Array(buf);
    const fb = new THREE.InterleavedBuffer(f32, 7);
    const ib = new THREE.InterleavedBuffer(i8, stride);
    const ub = new THREE.InterleavedBuffer(u8, stride);
    this.bld = { f32, i8, n, stride, ib };
    // hoogtes relatief maken
    for (let i = 0; i < n; i++) f32[i * 7 + 1] -= this.baseHeight;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(fb, 3, 0));
    geo.setAttribute('uv', new THREE.InterleavedBufferAttribute(fb, 2, 3));
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 20, true));
    geo.setAttribute('btype', new THREE.InterleavedBufferAttribute(ib, 1, 23, false));
    geo.setAttribute('battr', new THREE.InterleavedBufferAttribute(ub, 4, 24, false));
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const night = this.nightUniform;
    const ortho = this.ortho;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night;
      Object.assign(shader.uniforms, ortho);
      const ph = this.photo;
      const dummyArr = new THREE.DataArrayTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, 1);
      dummyArr.needsUpdate = true;
      shader.uniforms.uTexOn = { value: ph ? 1 : 0 };
      shader.uniforms.uWallD = { value: ph ? ph.wallD : dummyArr };
      shader.uniforms.uWallN = { value: ph ? ph.wallN : dummyArr };
      shader.uniforms.uTexSize = { value: ph ? ph.sizes : new Array(10).fill(1) };
      shader.uniforms.uTexAvg = { value: ph ? ph.avg : new Array(10).fill(0.1) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float btype;
          attribute vec4 battr;
          varying vec2 vB;
          flat varying float vType;
          flat varying float vMat;
          flat varying float vSeed;
          flat varying vec3 vWall;
          varying vec3 vWN;
          varying vec2 vWXZ;
          varying float vWY;
          float pickN(float h, float n){ return floor(h * n); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vB = uv; // gevels: uv.x = meters vanaf het begin van de gevel, uv.y = hoogte boven maaiveld
          vType = btype > 1.5 ? 0.0 : btype;
          // battr: [zaadje + bouwperiode, veilige onderrand, veilige bovenrand, gevelbreedte]
          vSeed = floor(battr.x / 4.0) * 4.0 / 255.0;
          float age = mod(battr.x, 4.0);
          vWall = vec3(battr.y * 0.15, battr.z * 0.15, battr.w * 0.25);
          vWN = normal;
          vWXZ = position.xz;
          vWY = position.y;
          float h = fract(vSeed * 7.13);
          // muren: 0 wit pleister, 1 mergel, 2 rode baksteen, 3 bruine baksteen, 4 gele baksteen, 5 grijs
          if (btype > 1.5) {
            vMat = 3.0; // vaste roodbruine baksteen (bijv. Ringweg 38)
          } else if (btype < 0.5) {
            float k = pickN(h, 4.0);
            if (age < 0.5) vMat = k == 0.0 ? 0.0 : (k == 1.0 ? 1.0 : (k == 2.0 ? 0.0 : 1.0));
            else if (age < 1.5) vMat = k == 0.0 ? 0.0 : (k == 1.0 ? 2.0 : (k == 2.0 ? 1.0 : 3.0));
            else vMat = k == 0.0 ? 3.0 : (k == 1.0 ? 4.0 : (k == 2.0 ? 0.0 : 5.0));
          } else {
            // daken: 10 leien, 11 rode pannen, 12 antraciet pannen, 13 plat
            float k = pickN(fract(vSeed * 3.71), 3.0);
            vMat = 10.0 + k;
            if (normal.y > 0.97) vMat = 13.0;
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNight;
          varying vec2 vB;
          flat varying float vType;
          flat varying float vMat;
          flat varying float vSeed;
          varying vec3 vWN;
          flat varying vec3 vWall;
          varying vec2 vWXZ;
          varying float vWY;
          vec3 gInside = vec3(0.0); // kamer achter het raam (voor het avondlicht)
          float gNear = 0.0;
          // Kamer achter een raam ("interior mapping"): wuv = plek op het glas (0..1), dT = kijkrichting langs de gevel,
          // de verticaal en de gevelnormaal (naar buiten). Muren, vloer, plafond met lamp, een schilderij, een kast en soms een plant.
          vec3 roomView(vec2 wuv, vec3 dT, vec2 wsize, float seed, float night, float lightOn) {
            vec3 d = vec3(dT.x / wsize.x, dT.y / wsize.y, min(dT.z, -1e-4) / 3.2);
            float tx = d.x > 0.0 ? (1.0 - wuv.x) / d.x : -wuv.x / min(d.x, -1e-5);
            float ty = d.y > 0.0 ? (1.0 - wuv.y) / d.y : -wuv.y / min(d.y, -1e-5);
            float tz = 1.0 / -d.z;
            float t = min(tx, min(ty, tz));
            vec3 h = vec3(wuv, 0.0) + d * t;
            float hs = fract(seed * 7.31);
            vec3 wallC = mix(vec3(0.82, 0.76, 0.64), vec3(0.62, 0.7, 0.78), hs);
            wallC = mix(wallC, vec3(0.86, 0.66, 0.5), step(0.72, fract(seed * 3.3)));
            vec3 col;
            if (t == tz) {
              col = wallC;
              float pic = step(abs(h.x - (0.3 + hs * 0.4)), 0.12) * step(abs(h.y - 0.62), 0.1);
              col = mix(col, mix(vec3(0.25, 0.4, 0.55), vec3(0.65, 0.35, 0.25), fract(seed * 11.0)), pic);
              float cab = step(h.y, 0.4) * step(abs(h.x - (0.72 - hs * 0.44)), 0.2);
              col = mix(col, vec3(0.42, 0.3, 0.2), cab);
            } else if (t == ty && d.y < 0.0) {
              col = mix(vec3(0.42, 0.3, 0.19), vec3(0.52, 0.39, 0.26), step(0.5, fract(h.x * 5.0 + floor(-h.z * 3.0) * 0.37)));
            } else if (t == ty) {
              col = vec3(0.9);
              float lampDisc = 1.0 - smoothstep(0.07, 0.11, length(vec2(h.x - 0.5, (h.z + 0.5) * 1.6)));
              col = mix(col, vec3(1.0, 0.86, 0.62) * (1.0 + 2.5 * lightOn * night), lampDisc);
            } else {
              col = wallC * 0.78;
            }
            // plant in de hoek, iets achter het glas
            float tp = 0.22 / -d.z;
            if (tp < t) {
              vec3 hp = vec3(wuv, 0.0) + d * tp;
              float plant = step(0.6, fract(seed * 5.7)) * (1.0 - smoothstep(0.1, 0.13, length(vec2((hp.x - 0.18) * 1.3, hp.y - 0.2))));
              plant = max(plant, step(0.6, fract(seed * 5.7)) * step(abs(hp.x - 0.18), 0.05) * step(hp.y, 0.12));
              col = mix(col, vec3(0.13, 0.32, 0.14), plant);
            }
            col *= mix(0.55, 1.0, 1.0 + h.z * 0.45);
            return col;
          }
          uniform sampler2D uOrtho;
          uniform vec4 uOrthoBox;
          uniform float uOrthoOn;
          uniform float uTexOn;
          uniform highp sampler2DArray uWallD;
          uniform highp sampler2DArray uWallN;
          uniform float uTexSize[10];
          uniform float uTexAvg[10];
          vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
          float hash2(vec2 p){ p = mod(p, 997.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
          }
          float boxMask(vec2 f, vec2 lo, vec2 hi, vec2 aa){
            vec2 a = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
            return a.x * a.y;
          }
          // metselwerk: geeft kleurfactor en voegmasker
          vec3 masonry(vec2 p, vec2 unit, float joint, vec3 col, vec3 mortar, float spread, float seed){
            vec2 q = p / unit;
            q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
            vec2 id = floor(q);
            vec2 f = fract(q);
            vec2 w = fwidth(q);
            float far = smoothstep(0.25, 0.6, max(w.x, w.y));
            vec2 jw = vec2(joint) / unit;
            vec2 m = smoothstep(vec2(0.0), jw + w, f) * smoothstep(vec2(0.0), jw + w, 1.0 - f);
            float stone = m.x * m.y;
            float v = (hash2(id + seed) - 0.5) * spread;
            vec3 c = col * (1.0 + v);
            vec3 near = mix(mortar, c, stone);
            vec3 avg = mix(mortar, col, 0.82);
            return mix(near, avg, far);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 base;
          float glass = 0.0;
          float opening = 0.0;
          vec3 tn = vec3(0.0, 0.0, 1.0);
          float tnAmt = 0.0;
          float lit = 0.0;
          float rough = 0.85;
          if (vType < 0.5) {
            float hgt = vB.y;
            vec2 wp = vec2(vB.x, hgt);
            // gevelmateriaal
            if (vMat < 0.5) {
              base = srgb(vec3(0.9, 0.88, 0.83));
              float n = vnoise(wp * 1.3) * 0.6 + vnoise(wp * 6.0) * 0.4;
              base *= 0.93 + n * 0.1;
              base *= 1.0 - smoothstep(0.6, 0.0, fract(wp.y / 7.0)) * 0.03 * vnoise(vec2(wp.x * 3.0, 0.0));
            } else if (vMat < 1.5) {
              base = masonry(wp, vec2(0.46, 0.27), 0.012, srgb(vec3(0.83, 0.75, 0.56)), srgb(vec3(0.74, 0.7, 0.62)), 0.16, vSeed * 50.0);
              base *= 0.94 + vnoise(wp * 2.0) * 0.1;
            } else if (vMat < 2.5) {
              base = masonry(wp, vec2(0.22, 0.0625), 0.011, srgb(vec3(0.6, 0.31, 0.22)), srgb(vec3(0.72, 0.69, 0.64)), 0.28, vSeed * 50.0);
            } else if (vMat < 3.5) {
              base = masonry(wp, vec2(0.22, 0.0625), 0.011, srgb(vec3(0.45, 0.28, 0.2)), srgb(vec3(0.62, 0.6, 0.56)), 0.3, vSeed * 50.0);
            } else if (vMat < 4.5) {
              base = masonry(wp, vec2(0.22, 0.0625), 0.011, srgb(vec3(0.78, 0.65, 0.46)), srgb(vec3(0.8, 0.78, 0.72)), 0.2, vSeed * 50.0);
            } else {
              base = srgb(vec3(0.68, 0.67, 0.64)) * (0.94 + vnoise(wp * 3.0) * 0.08);
            }
            // fototextuur (per gebouw een iets andere tint)
            if (uTexOn > 0.5) {
              int L = int(vMat + 0.5);
              vec2 tuv = (wp + vec2(fract(vSeed * 91.7) * 7.0, 0.0)) / uTexSize[L];
              vec3 tc = texture(uWallD, vec3(tuv, float(L))).rgb;
              if (L == 0) tc *= 1.18; // wit pleisterwerk
              base = tc * (0.92 + fract(vSeed * 17.3) * 0.16);
              tn = texture(uWallN, vec3(tuv, float(L))).xyz * 2.0 - 1.0;
              tnAmt = 1.0;
            }
            // plint van hardsteen
            float plint = 1.0 - smoothstep(vWall.x + 0.5, vWall.x + 0.52, hgt);
            base = mix(base, srgb(vec3(0.24, 0.24, 0.25)) * (0.9 + vnoise(wp * 8.0) * 0.2), plint);

            // ramen en deuren in een raster van traveeën
            // traveeën gecentreerd over de gevelbreedte
            float wl = vWall.z;
            float bays = max(1.0, floor(wl / 2.8));
            float uoff = (wl - bays * 2.8) * 0.5;
            vec2 cell = vec2((vB.x - uoff) / 2.8, hgt / 2.9);
            vec2 id = floor(cell);
            vec2 f = fract(cell);
            vec2 aa = fwidth(cell) * 1.2;
            float r = hash2(id + vSeed * 91.0);
            float r2 = hash2(id.yx * 1.7 + vSeed * 13.0);
            // een raam of deur alleen als hij er helemaal op past: nooit afgesneden door grond, dak of gevelrand
            float x0 = (id.x + 0.29) * 2.8 + uoff, x1 = (id.x + 0.71) * 2.8 + uoff;
            float fitsX = step(0.2, x0) * step(x1, wl - 0.2);
            bool groundFloor = id.y < 0.5;
            bool isDoor = groundFloor && r2 < 0.22 && vWall.x < 0.35;
            float fitsY = isDoor
              ? step(0.8 * 2.9, vWall.y - 0.15)
              : step(vWall.x + 0.1, (id.y + 0.28) * 2.9) * step((id.y + 0.86) * 2.9, vWall.y - 0.15);
            float allowed = step(0.1, r) * fitsX * fitsY;
            if (isDoor) {
              float door = boxMask(f, vec2(0.36, 0.0), vec2(0.64, 0.76), aa);
              float dframe = boxMask(f, vec2(0.34, 0.0), vec2(0.66, 0.78), aa) - door;
              vec3 dc = r < 0.33 ? srgb(vec3(0.15, 0.25, 0.2)) : (r < 0.66 ? srgb(vec3(0.32, 0.2, 0.12)) : srgb(vec3(0.12, 0.16, 0.28)));
              float panel = boxMask(fract(vec2(f.x * 8.0 - 2.88, f.y * 3.0)), vec2(0.15), vec2(0.85), aa * 6.0);
              base = mix(base, srgb(vec3(0.88, 0.86, 0.82)), dframe * allowed);
              base = mix(base, dc * mix(0.75, 1.0, panel), door * allowed);
              opening = clamp((door + dframe) * allowed, 0.0, 1.0);
              rough = mix(rough, 0.5, door * allowed);
            } else {
              vec2 lo = vec2(0.32, 0.32), hi = vec2(0.68, 0.84);
              vec2 loO = lo - 0.025, hiO = hi + vec2(0.025, 0.02); // buitenmaat van het kozijn = de opening in de muur
              // Het raam ligt 11 cm terug in de muur. Van dichtbij wordt uitgerekend waar de kijklijn het teruggelegde
              // raam raakt: je ziet dan de zijkant van de muur (de negge) en het raam verschuift mee als je erlangs loopt.
              vec3 wpos = vec3(vWXZ.x, vWY, vWXZ.y);
              float camD = distance(wpos, cameraPosition);
              vec3 V = normalize(wpos - cameraPosition);
              vec3 Nw2 = normalize(vec3(vWN.x, 0.0, vWN.z) + 1e-5);
              vec3 Tw2 = vec3(-Nw2.z, 0.0, Nw2.x);
              // loopt de gevelmaat (vB.x) met Tw2 mee of ertegenin? Dat verschilt per gevel; de afgeleiden vertellen het.
              float uDir = dot(Tw2, dFdx(wpos)) * dFdx(vB.x) + dot(Tw2, dFdy(wpos)) * dFdy(vB.x) < 0.0 ? -1.0 : 1.0;
              vec3 dT = vec3(dot(V, Tw2) * uDir, V.y, dot(V, Nw2));
              vec2 shiftM = dT.xy / max(-dT.z, 0.2) * 0.11 * (1.0 - smoothstep(35.0, 60.0, camD));
              shiftM *= min(1.0, 0.3 / max(length(shiftM), 1e-4));
              vec2 fr = f + shiftM / vec2(2.8, 2.9);
              float inO = boxMask(f, loO, hiO, aa);
              float hitO = boxMask(fr, loO, hiO, aa);
              float win = boxMask(fr, lo, hi, aa);
              float frame = clamp(hitO - win, 0.0, 1.0);
              float sill = boxMask(f, vec2(0.3, lo.y - 0.045), vec2(0.7, lo.y - 0.01), aa);
              // roeden: één staander en een kalf
              float mull = boxMask(fr, vec2(0.493, lo.y), vec2(0.507, hi.y), aa) + boxMask(fr, vec2(lo.x, 0.655), vec2(hi.x, 0.668), aa);
              mull = clamp(mull, 0.0, 1.0) * win;
              // diepte: schaduw bovenin de dagkant
              float reveal = smoothstep(hi.y, hi.y - 0.06, fr.y) ;
              glass = win * inO * allowed * (1.0 - mull);
              vec3 frameCol = r2 < 0.75 ? srgb(vec3(0.9, 0.89, 0.86)) : srgb(vec3(0.12, 0.13, 0.13));
              // de negge: bovenin donker (onderkant van de latei), opzij in de schaduw, onderin licht (de vensterbank loopt door)
              vec3 jamb = base * (fr.y > hiO.y ? 0.45 : (fr.y < loO.y ? 1.0 : 0.66));
              vec3 content = mix(base, frameCol, clamp(frame + mull, 0.0, 1.0));
              // binnenkant: donker met soms gordijnen
              float curtain = step(0.55, r2) * (smoothstep(lo.x + 0.07, lo.x + 0.05, fr.x) + smoothstep(hi.x - 0.07, hi.x - 0.05, fr.x));
              vec3 inside = mix(vec3(0.015, 0.018, 0.022), srgb(vec3(0.7, 0.62, 0.5)) * 0.35, clamp(curtain, 0.0, 1.0));
              // dichtbij: echt naar binnen kijken (kamer met lamp, schilderij, kast, plant); veraf het oude, donkere glas
              float lightOn = step(r, 0.58);
              if (camD < 70.0 && glass > 0.01) {
                vec2 wuv = vec2((fr.x - lo.x) / (hi.x - lo.x), (fr.y - lo.y) / (hi.y - lo.y));
                vec3 room = roomView(wuv, dT, vec2((hi.x - lo.x) * 2.8, (hi.y - lo.y) * 2.9), r2 + id.x * 0.137 + id.y * 0.713 + vSeed, uNight, lightOn);
                room = mix(room, srgb(vec3(0.75, 0.66, 0.52)), clamp(curtain, 0.0, 1.0) * 0.85); // gordijnen
                gInside = room;
                gNear = 1.0 - smoothstep(50.0, 70.0, camD);
                // overdag gedempt (binnen is het donkerder dan buiten), 's avonds donker tenzij het licht aan is
                vec3 dayRoom = room * 0.32;
                inside = mix(inside, mix(dayRoom, room * 0.06, uNight), gNear);
              }
              inside *= mix(1.0, 0.6, reveal);
              content = mix(content, inside, win * (1.0 - mull));
              base = mix(base, mix(jamb, content, hitO), inO * allowed);
              base = mix(base, srgb(vec3(0.6, 0.59, 0.56)), sill * allowed);
              lit = glass * lightOn * uNight;
              opening = clamp((inO + sill) * allowed, 0.0, 1.0);
            }
            tnAmt *= (1.0 - opening) * (1.0 - plint);
            // vuil en schaduw onderaan de gevel
            base *= mix(0.72, 1.0, smoothstep(vWall.x, vWall.x + 1.2, hgt));
            rough = mix(rough, 0.06, glass); // glad glas: de lucht spiegelt erin
          } else {
            // daken
            vec2 dir = normalize(vec2(vWN.x, -vWN.z) + 1e-4);
            vec2 perp = vec2(-dir.y, dir.x);
            vec2 rp = vec2(dot(vB, perp), dot(vB, dir));
            float avgL;
            if (vMat < 10.5) {
              base = masonry(rp, vec2(0.25, 0.17), 0.008, srgb(vec3(0.3, 0.32, 0.36)), srgb(vec3(0.16, 0.17, 0.19)), 0.22, vSeed * 30.0);
              avgL = dot(mix(srgb(vec3(0.16, 0.17, 0.19)), srgb(vec3(0.3, 0.32, 0.36)), 0.82), vec3(0.333));
              rough = 0.6;
            } else if (vMat < 11.5 || vMat < 12.5) {
              vec3 tc = vMat < 11.5 ? srgb(vec3(0.55, 0.25, 0.17)) : srgb(vec3(0.25, 0.25, 0.26));
              vec2 q = rp / vec2(0.22, 0.32);
              q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
              vec2 fq = fract(q);
              vec2 w = fwidth(q);
              float far = smoothstep(0.3, 0.7, max(w.x, w.y));
              float curve = 0.75 + 0.25 * sin(fq.x * 3.14159);
              float lap = mix(0.7, 1.0, smoothstep(0.0, 0.18 + w.y, fq.y));
              float v = 1.0 + (hash2(floor(q) + vSeed * 9.0) - 0.5) * 0.25;
              base = tc * mix(curve * lap * v, 0.85, far);
              avgL = dot(tc, vec3(0.333)) * 0.85;
              rough = 0.7;
            } else {
              base = srgb(vec3(0.33, 0.33, 0.32)) * (0.9 + vnoise(vB * 4.0) * 0.15);
              avgL = dot(srgb(vec3(0.33, 0.33, 0.32)), vec3(0.333)) * 0.97;
              rough = 0.95;
            }
            if (uTexOn > 0.5) {
              int L = 6 + int(vMat - 10.0 + 0.5);
              // soort dak kiezen op basis van de luchtfoto: roodachtig = rode pannen, anders leien of antraciet
              if (uOrthoOn > 0.5 && vMat < 12.5) {
                vec3 o0 = textureLod(uOrtho, (vWXZ - uOrthoBox.xy) / uOrthoBox.zw, 3.5).rgb;
                float red = (o0.r - o0.b) / max(0.02, dot(o0, vec3(0.333)));
                L = red > 0.35 ? 7 : (fract(vSeed * 5.3) < 0.65 ? 6 : 8);
              }
              base = texture(uWallD, vec3(rp / uTexSize[L], float(L))).rgb;
              avgL = uTexAvg[L];
            }
            // mos en verkleuring
            base *= 0.92 + vnoise(vB * 0.7) * 0.12;
            // echte dakkleur uit de luchtfoto (vervaagd, de foto staat iets scheef t.o.v. de daken)
            vec3 oc = textureLod(uOrtho, (vWXZ - uOrthoBox.xy) / uOrthoBox.zw, 3.0).rgb;
            // het patroon (pannen, leien) blijft, de kleur komt van de foto
            float pat = clamp(dot(base, vec3(0.333)) / max(0.01, avgL), 0.4, 1.6);
            base = mix(base, oc * 1.08 * pat, (uTexOn > 0.5 ? 0.22 : 0.6) * uOrthoOn);
          }
          diffuseColor.rgb = base;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = rough;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (tnAmt > 0.01) {
            vec3 Nw = normalize(vWN);
            vec3 Tw = normalize(vec3(-Nw.z, 0.0, Nw.x) + 1e-5);
            vec3 nw = normalize(Tw * tn.x * tnAmt + vec3(0.0, 1.0, 0.0) * tn.y * tnAmt + Nw * max(0.3, tn.z));
            normal = normalize(mat3(viewMatrix) * nw);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // avondlicht: dichtbij de kamer zelf (warm verlicht), veraf een gelijkmatige warme gloed
          totalEmissiveRadiance += mix(vec3(1.0, 0.62, 0.3) * (0.5 + 0.35 * fract(vSeed * 13.7)), gInside * vec3(1.15, 0.92, 0.65) * 1.6, gNear) * lit;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.buildingMesh = mesh;
  }

  // Dakranden: de daken uit de 3D BAG eindigen precies op de gevel, waardoor huizen op dozen lijken.
  // Hier krijgt elke vrije rand van een dak een overstek (het dak steekt 28 cm uit) met een boeibord eronder:
  // langs de dakvoet een zinken goot, langs de schuine kanten een lichte windveer, bij platte daken een daktrim.
  // Het overstek werpt een echte schaduw op de gevel.
  buildRoofTrim() {
    const { f32, i8, n, stride } = this.bld;
    const key = (i) => Math.round(f32[i * 7] * 50) + ',' + Math.round(f32[i * 7 + 1] * 50) + ',' + Math.round(f32[i * 7 + 2] * 50);
    const edges = new Map();
    for (let v = 0; v < n; v += 3) {
      if (i8[v * stride + 23] !== 1) continue; // alleen dakvlakken
      const k = [key(v), key(v + 1), key(v + 2)];
      for (let e = 0; e < 3; e++) {
        const a = v + e, b = v + (e + 1) % 3, c = v + (e + 2) % 3;
        const id = k[e] < k[(e + 1) % 3] ? k[e] + '|' + k[(e + 1) % 3] : k[(e + 1) % 3] + '|' + k[e];
        const rec = edges.get(id);
        if (rec) rec.count++; else edges.set(id, { a, b, c, count: 1 });
      }
    }
    const pos = [], col = [], nrm = [];
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3(), O = new THREE.Vector3(), T = new THREE.Vector3();
    const quad = (p0, p1, p2, p3, nn, c) => {
      for (const p of [p0, p1, p2, p0, p2, p3]) { pos.push(p.x, p.y, p.z); nrm.push(nn.x, nn.y, nn.z); col.push(c[0], c[1], c[2]); }
    };
    const P = () => new THREE.Vector3();
    for (const { a, b, c, count } of edges.values()) {
      if (count !== 1) continue;
      A.set(f32[a * 7], f32[a * 7 + 1], f32[a * 7 + 2]); B.set(f32[b * 7], f32[b * 7 + 1], f32[b * 7 + 2]); C.set(f32[c * 7], f32[c * 7 + 1], f32[c * 7 + 2]);
      E.subVectors(B, A);
      const len = E.length();
      if (len < 0.5) continue;
      N.set(i8[a * stride + 20], i8[a * stride + 21], i8[a * stride + 22]).normalize();
      if (N.y < 0.2) continue;
      // richting in het dakvlak, van het dak af
      O.crossVectors(N, E).normalize();
      if (O.dot(T.subVectors(C, A)) > 0) O.negate();
      const flat = N.y > 0.97, eave = Math.abs(E.y) / len < 0.08;
      const w = flat ? 0.1 : 0.28, drop = flat ? 0.22 : eave ? 0.16 : 0.14;
      // het overstek ligt een fractie boven het dak (anders flikkert het tegen het dakvlak)
      const up = T.copy(N).multiplyScalar(0.015);
      const a0 = P().copy(A).add(up).addScaledVector(O, -0.05), b0 = P().copy(B).add(up).addScaledVector(O, -0.05);
      const a1 = P().copy(A).add(up).addScaledVector(O, w), b1 = P().copy(B).add(up).addScaledVector(O, w);
      const a2 = P().copy(a1), b2 = P().copy(b1); a2.y -= drop; b2.y -= drop;
      const a3 = P().copy(A).addScaledVector(O, 0.0), b3 = P().copy(B); a3.y -= drop * 0.9; b3.y -= drop * 0.9;
      const dark = [0.035, 0.036, 0.04], board = flat ? [0.2, 0.2, 0.21] : eave ? [0.16, 0.17, 0.18] : [0.62, 0.61, 0.58];
      quad(a0, b0, b1, a1, N, dark);                                   // bovenkant: verlengde van het dak
      const out = P().set(O.x, 0, O.z).normalize();
      quad(a1, b1, b2, a2, out, board);                                // boeibord, goot of windveer
      quad(a2, b2, b3, a3, P().set(0, -1, 0), [0.3, 0.3, 0.3]);       // onderkant van het overstek
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
    keepNormals(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.roofTrim = mesh;
    console.info(`dakranden: ${pos.length / 9} driehoeken`);
  }

  // Schoorstenen: op de meeste gewone huizen met een schuin dak komt een gemetselde schoorsteen bij de nok.
  // De plek volgt uit het dak zelf: het hoogste punt van het dak boven het pand, een stukje naar het midden toe.
  buildChimneys() {
    const { f32, i8, n, stride } = this.bld;
    // per pand het hoogste en laagste dakpunt
    const top = new Map();
    for (let v = 0; v < n; v += 3) {
      if (i8[v * stride + 23] !== 1) continue;
      const cx = (f32[v * 7] + f32[(v + 1) * 7] + f32[(v + 2) * 7]) / 3, cz = (f32[v * 7 + 2] + f32[(v + 1) * 7 + 2] + f32[(v + 2) * 7 + 2]) / 3;
      let fi = -1;
      for (const i of this.nearbyFootprints(cx, cz)) if (pointInRing(cx, cz, this.footprints[i].ring)) { fi = i; break; }
      if (fi < 0) continue;
      let rec = top.get(fi);
      if (!rec) top.set(fi, rec = { max: -1e9, min: 1e9, x: 0, z: 0 });
      for (let k = 0; k < 3; k++) {
        const y = f32[(v + k) * 7 + 1];
        if (y > rec.max) { rec.max = y; rec.x = f32[(v + k) * 7]; rec.z = f32[(v + k) * 7 + 2]; }
        if (y < rec.min) rec.min = y;
      }
    }
    const rand = rng(1907);
    const spots = [];
    for (const [fi, r] of top) {
      const f = this.footprints[fi];
      const area = (f.maxX - f.minX) * (f.maxZ - f.minZ);
      if (area < 35 || area > 420 || r.max - r.min < 1.6 || rand() > 0.7) continue;
      // een stukje van het hoogste punt naar het midden van het pand: dan staat hij op het dak en niet op de rand
      const mx = (f.minX + f.maxX) / 2, mz = (f.minZ + f.maxZ) / 2;
      const d = Math.hypot(mx - r.x, mz - r.z) || 1, k = Math.min(1.3, d * 0.5) / d;
      // recht met het huis mee: de richting van de langste gevel
      let best = 0, ang = 0;
      for (let i = 0; i < f.ring.length; i++) {
        const [ax, az] = f.ring[i], [bx, bz] = f.ring[(i + 1) % f.ring.length], l = Math.hypot(bx - ax, bz - az);
        if (l > best) { best = l; ang = Math.atan2(bx - ax, bz - az); }
      }
      spots.push([r.x + (mx - r.x) * k, r.max, r.z + (mz - r.z) * k, rand(), ang]);
    }
    if (!spots.length) return;
    const body = new THREE.BoxGeometry(0.55, 2.3, 0.55).translate(0, -0.45, 0); // steekt 70 cm boven de nok uit, de rest zit in het dak
    const cap = new THREE.BoxGeometry(0.68, 0.08, 0.68).translate(0, 0.72, 0);
    const pot = new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8).translate(0, 0.9, 0);
    const bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), spots.length);
    const caps = new THREE.InstancedMesh(mergeGeometries([cap, pot]), new THREE.MeshStandardMaterial({ color: 0x3b3a39, roughness: 0.8 }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const bricks = [0x6e3b2c, 0x5a3327, 0x7a5a45, 0x8a8478, 0x4a3a33];
    spots.forEach(([x, y, z, r, ang], i) => {
      p.set(x, y, z); q.setFromAxisAngle(up, ang);
      m.compose(p, q, one);
      bodies.setMatrixAt(i, m); caps.setMatrixAt(i, m);
      bodies.setColorAt(i, col.set(bricks[Math.floor(r * bricks.length) % bricks.length]));
    });
    for (const im of [bodies, caps]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im); }
    console.info(`schoorstenen: ${spots.length}`);
  }

  // ------------------------------------------------------------ botsingen

  setupCollision(footprints) {
    this.footprints = footprints.map((f) => {
      const ring = f.ring;
      const h = f.h, g = f.g;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const [x, z] of ring) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      return { ring, minX, minZ, maxX, maxZ, h, top: g + h - this.baseHeight };
    });
    this.cell = 16;
    this.cells = new Map();
    this.footprints.forEach((f, idx) => {
      for (let cx = Math.floor(f.minX / this.cell); cx <= Math.floor(f.maxX / this.cell); cx++) {
        for (let cz = Math.floor(f.minZ / this.cell); cz <= Math.floor(f.maxZ / this.cell); cz++) {
          const k = cx * 100000 + cz;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(idx);
        }
      }
    });
  }

  // extra obstakel (bijv. een monument) toevoegen aan de botsingen
  addObstacle(ring) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x, z] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const idx = this.footprints.length;
    this.footprints.push({ ring, minX, minZ, maxX, maxZ, extra: true });
    for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx++) {
      for (let cz = Math.floor(minZ / this.cell); cz <= Math.floor(maxZ / this.cell); cz++) {
        const k = cx * 100000 + cz;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(idx);
      }
    }
  }

  // Panden in de buurt. Hergebruikt één lijst en een 'stempel' per pand, zodat er per beeld
  // geen duizenden tijdelijke objecten ontstaan (die gaven haperingen op telefoons).
  nearbyFootprints(x, z) {
    if (!this._stamp) { this._stamp = new Uint32Array(this.footprints.length + 64); this._stampId = 0; this._near = []; }
    if (this._stamp.length < this.footprints.length) { const n = new Uint32Array(this.footprints.length + 64); n.set(this._stamp); this._stamp = n; }
    const id = ++this._stampId;
    const out = [];
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.cells.get((cx + dx) * 100000 + (cz + dz));
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (this._stamp[i] !== id) { this._stamp[i] = id; out.push(i); }
      }
    }
    return out;
  }

  // eerste punt op de lijn van (ax,ay,az) naar (bx,by,bz) dat in een gebouw zit; geeft fractie 0..1
  occlusion(ax, ay, az, bx, by, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 0.4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (const k of this.nearbyFootprints(x, z)) {
        const f = this.footprints[k];
        if (f.extra) continue;
        if (y < (f.top ?? 1e9) && x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && pointInRing(x, z, f.ring)) return t;
      }
    }
    return 1;
  }

  // dichtstbijzijnde gevel binnen maxD: punt op de gevel, normaal naar buiten, afstand en of (x,z) binnen het pand ligt
  nearestWall(x, z, maxD = 4) {
    let best = null;
    for (const k of this.nearbyFootprints(x, z)) {
      const f = this.footprints[k];
      if (f.extra) continue;
      const r = f.ring;
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
        if (l2 < 0.25) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
        if (d >= maxD || (best && d >= best.d)) continue;
        const l = Math.sqrt(l2);
        let nx = ez / l, nz = -ex / l;
        if (pointInRing(px + nx * 0.3, pz + nz * 0.3, r)) { nx = -nx; nz = -nz; }
        best = { px, pz, nx, nz, ux: ex / l, uz: ez / l, d, inside: pointInRing(x, z, r) };
      }
    }
    return best;
  }

  // een plek die niet op de rijbaan en niet in een pand ligt, zo dicht mogelijk bij (x, z)
  offRoad(x, z, maxR = 4) {
    const ok = (a, b) => this.classAt(a, b) !== 'rijbaan' && this.classAt(a, b) !== 'water' && !this.insideBuilding(a, b);
    if (ok(x, z)) return [x, z];
    for (let r = 0.5; r <= maxR; r += 0.5) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r; if (ok(px, pz)) return [px, pz]; }
    return null;
  }

  insideBuilding(x, z) {
    for (const i of this.nearbyFootprints(x, z)) if (pointInRing(x, z, this.footprints[i].ring)) return true;
    return false;
  }

  // duwt een cirkel (x,z,r) uit gebouwen; geeft gecorrigeerde positie terug
  resolve(x, z, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const i of this.nearbyFootprints(x, z)) {
        const f = this.footprints[i];
        if (x < f.minX - r || x > f.maxX + r || z < f.minZ - r || z > f.maxZ + r) continue;
        const inside = pointInRing(x, z, f.ring);
        let best = Infinity, bx = 0, bz = 0;
        const ring = f.ring;
        for (let k = 0; k < ring.length; k++) {
          const [ax, az] = ring[k], [qx, qz] = ring[(k + 1) % ring.length];
          const ex = qx - ax, ez = qz - az;
          const len2 = ex * ex + ez * ez || 1;
          let t = ((x - ax) * ex + (z - az) * ez) / len2;
          t = Math.max(0, Math.min(1, t));
          const px = ax + ex * t, pz = az + ez * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < best) { best = d; bx = px; bz = pz; }
        }
        if (inside) {
          const dx = bx - x, dz = bz - z;
          const d = Math.hypot(dx, dz) || 1;
          x = bx + (dx / d) * r; z = bz + (dz / d) * r;
          moved = true;
        } else if (best < r) {
          const dx = x - bx, dz = z - bz;
          const d = best || 1;
          x = bx + (dx / d) * r; z = bz + (dz / d) * r;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const b = this.coreBox, m = 15;
    x = Math.max(b.x0 + m, Math.min(b.x1 - m, x));
    z = Math.max(b.z0 + m, Math.min(b.z1 - m, z));
    return [x, z];
  }

  // ------------------------------------------------------------ bomen en straatmeubilair

  // Bomen: dichtbij echte boommodellen (ez-tree, MIT) met schors en bladeren, veraf lichte bolletjesbomen.
  async buildTrees() {
    const rand = rng(2072);
    const pts = this.objects.trees.map(([x, z]) => [x, z, 0.75 + rand() * 0.6, 0]);
    // extra bomen in bospercelen binnen het dorp
    const b = this.coreBox;
    const extra = this.isMobile ? 1200 : 3000;
    let tries = 0, added = 0;
    while (added < extra && tries < extra * 30) {
      tries++;
      const x = b.x0 + rand() * (b.x1 - b.x0), z = b.z0 + rand() * (b.z1 - b.z0);
      const cls = this.classAt(x, z);
      if (cls === 'bos' || (cls === 'struiken' && rand() < 0.3)) {
        pts.push([x, z, 0.8 + rand() * 0.7, 1]);
        added++;
      }
    }
    this.treePoints = pts;

    const variants = await this.makeTreeVariants().catch((e) => { console.warn('bomen', e); return []; });

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.2, 6);
    trunkGeo.translate(0, 2.6, 0);
    const canopyGeo = mergeBlobs(rand);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
    const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    // bomen per vak van 200 m, zodat alleen vakken in beeld (en in de schaduwcamera) getekend worden
    const T = 200;
    const tiles = new Map();
    for (const t of pts) {
      const k = Math.floor(t[0] / T) + ',' + Math.floor(t[1] / T);
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push(t);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    this.treeTiles = [];
    for (const [key, list] of tiles) {
      const [tx, tz] = key.split(',').map(Number);
      const far = new THREE.Group(), near = new THREE.Group();
      const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, list.length);
      // per boom de stand voor veraf (grove boom) en dichtbij (echte boom); welke getekend wordt kiest updateTrees per boom
      const recs = [];
      const perVar = variants.map(() => 0);
      list.forEach(([x, z, sc, kind], i) => {
        const yaw = rand() * Math.PI * 2;
        const sy = 0.9 + rand() * 0.3;
        p.set(x, this.heightAt(x, z) - 0.1, z);
        q.setFromAxisAngle(up, yaw);
        s.set(sc, sc * sy, sc);
        m.compose(p, q, s);
        trunk.setMatrixAt(i, m);
        canopy.setMatrixAt(i, m);
        const fm = m.toArray();
        if (kind === 1) col.setHSL(0.26 + rand() * 0.05, 0.45, 0.2 + rand() * 0.07);
        else col.setHSL(0.22 + rand() * 0.08, 0.45 + rand() * 0.15, 0.26 + rand() * 0.1);
        canopy.setColorAt(i, col);
        let vi = -1, nm = null;
        if (variants.length) {
          vi = Math.floor(rand() * variants.length);
          perVar[vi]++;
          p.set(x, this.heightAt(x, z) - 0.15, z);
          s.setScalar(variants[vi].scale * sc * sy);
          m.compose(p, q, s);
          nm = m.toArray();
        }
        recs.push({ x, z, fm, c: [col.r, col.g, col.b], vi, nm });
      });
      for (const im of [trunk, canopy]) { im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; far.add(im); }
      const nearMeshes = variants.map((v, vi) => {
        if (!perVar[vi]) return null;
        const br = new THREE.InstancedMesh(v.branchGeo, v.barkMat, perVar[vi]);
        const lf = new THREE.InstancedMesh(v.leafGeo, v.leafMat, perVar[vi]);
        let k = 0;
        for (const r of recs) if (r.vi === vi) { m.fromArray(r.nm); br.setMatrixAt(k, m); lf.setMatrixAt(k, m); k++; }
        for (const im of [br, lf]) { im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; im.count = 0; near.add(im); }
        return { br, lf };
      });
      near.visible = false;
      this.scene.add(far, near);
      this.treeTiles.push({ minX: tx * T, minZ: tz * T, maxX: (tx + 1) * T, maxZ: (tz + 1) * T, far, near, trunk, canopy, nearMeshes, recs, mode: 'far', hasNear: near.children.length > 0 });
    }
  }

  // Boomsoorten: vooraf gemaakt met ez-tree (tools/bake-trees.cjs) en als klein bestand geladen.
  // Ontbreekt dat bestand, dan maken we ze hier ter plekke (dan wordt ez-tree zelf geladen, ~4 MB).
  async makeTreeVariants() {
    const file = await fetchJson('trees/trees.json').catch(() => null);
    let vs;
    if (file) {
      const use = file.variants.filter((v) => !this.isMobile || v.mobile);
      const need = new Set(use.flatMap((v) => [v.barkMap, v.barkNormal, v.leafMap]));
      const tex = {};
      await Promise.all(file.textures.filter((t) => need.has(t.id)).map(async (t) => {
        const tx = await loadTexture('trees/' + t.file);
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.flipY = t.flipY;
        tx.repeat.set(...t.repeat);
        if (!t.srgb) tx.colorSpace = THREE.NoColorSpace;
        tex[t.id] = tx;
      }));
      vs = use.map((v) => ({ ...v, branch: decodeGeo(v.branch), leaf: decodeGeo(v.leaf), barkMap: tex[v.barkMap], barkNormal: tex[v.barkNormal], leafMap: tex[v.leafMap] }));
    } else {
      vs = (await this.generateTreeData()).filter((v) => !this.isMobile || v.mobile);
    }
    return vs.map((v) => this.treeVariant(v));
  }

  async generateTreeData() {
    const { Tree } = await import('@dgreenheck/ez-tree');
    const list = ['Oak Medium', 'Ash Medium', 'Aspen Medium', 'Oak Large'];
    return list.map((name, i) => {
      const t = new Tree();
      t.loadPreset(name);
      const o = t.options;
      o.seed = 4242 + i * 977;
      // minder segmenten en minder, grotere blaadjes: zelfde silhouet, een fractie van de driehoeken
      o.branch.sections = { 0: 6, 1: 4, 2: 3, 3: 1 };
      o.branch.segments = { 0: 6, 1: 4, 2: 3, 3: 3 };
      o.leaves.count = Math.max(3, Math.round(o.leaves.count * 0.3));
      o.leaves.size *= 1.7;
      t.generate();
      const om = t.branchesMesh.material, ol = t.leavesMesh.material;
      return {
        name, mobile: name === 'Aspen Medium' || name === 'Ash Medium', branch: t.branchesMesh.geometry, leaf: t.leavesMesh.geometry,
        barkMap: om.map, barkNormal: om.normalMap, leafMap: ol.map, barkColor: om.color.getHex(), leafColor: ol.color.getHex(),
      };
    });
  }

  treeVariant(v) {
    const bg = v.branch, lg = v.leaf;
    bg.computeBoundingBox();
    const h = bg.boundingBox.max.y - bg.boundingBox.min.y;
    const scale = (v.name.includes('Large') ? 14 : 11) / Math.max(1, h);
    // bladnormalen naar buiten vanuit het midden van de kruin: oogt als een volle, ronde boom
    lg.computeBoundingBox();
    const c = new THREE.Vector3(); lg.boundingBox.getCenter(c);
    const lp = lg.attributes.position;
    if (!lg.attributes.normal) lg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(lp.count * 3), 3));
    const ln = lg.attributes.normal;
    for (let k = 0; k < lp.count; k++) {
      const nx = lp.getX(k) - c.x, ny = (lp.getY(k) - c.y) * 0.8 + h * 0.08, nz = lp.getZ(k) - c.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      ln.setXYZ(k, nx / l, ny / l, nz / l);
    }
    if (!bg.attributes.normal) bg.computeVertexNormals();
    this.treeTime ||= { value: 0 };
    const time = this.treeTime;
    const barkMat = new THREE.MeshStandardMaterial({ map: v.barkMap, normalMap: v.barkNormal, color: v.barkColor, roughness: 0.95 });
    // esp: zomergroen in plaats van herfstgeel
    const leafColor = v.name.includes('Aspen') ? new THREE.Color(0x9cc46a) : new THREE.Color(v.leafColor).multiplyScalar(0.9);
    const leafMat = new THREE.MeshStandardMaterial({
      map: v.leafMap, color: leafColor, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85,
    });
    if (Q.msaa) leafMat.alphaToCoverage = true; // zachtere bladranden (alleen met kantverzachting in de nabewerking)
    leafMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      // zacht wiegen in de wind (per boom een andere fase)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
          #else
            float ph = 0.0;
          #endif
          float sway = sin(uTime * 1.3 + ph + position.y * 0.05) * 0.5 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
          transformed.xz += sway * 0.012 * max(0.0, position.y) * vec2(1.0, 0.6);`);
      // achterkant van een blad niet donker maken (de normalen wijzen al naar buiten)
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    };
    const tris = ((bg.index ? bg.index.count : 0) + (lg.index ? lg.index.count : 0)) / 3;
    console.info(`boom ${v.name}: ${Math.round(tris)} driehoeken`);
    return { branchGeo: bg, leafGeo: lg, barkMat, leafMat, scale, tris, src: v };
  }

  // Voor tools/bake-trees.cjs: de boomsoorten als data (geometrie in base64, texturen als data-URL).
  async exportTrees() {
    const data = await this.generateTreeData();
    const textures = [];
    const texId = (t, srgb) => {
      let e = textures.find((x) => x.src === t.image.src);
      if (!e) { e = { id: 't' + textures.length, src: t.image.src, repeat: [t.repeat.x, t.repeat.y], flipY: t.flipY, srgb }; textures.push(e); }
      return e.id;
    };
    const variants = data.map((v) => ({
      name: v.name, mobile: v.mobile, barkColor: v.barkColor, leafColor: v.leafColor,
      branch: encodeGeo(v.branch), leaf: encodeGeo(v.leaf),
      barkMap: texId(v.barkMap, true), barkNormal: texId(v.barkNormal, false), leafMap: texId(v.leafMap, true),
    }));
    return { variants, textures };
  }

  // begroeiing alleen in de buurt tekenen (struiken en gras zie je van ver toch niet)
  updateVegetation(cam) {
    if (!this.vegTiles) return;
    const R = Q.begroeiingBereik;
    for (const g of this.vegTiles) g.visible = Math.hypot(g.userData.c[0] - cam.x, g.userData.c[1] - cam.z) < R;
  }

  // dichtbij echte bomen, veraf de lichte versie
  updateTrees(cam, time) {
    if (!this.treeTiles) return;
    if (this.treeTime) this.treeTime.value = time;
    // per boom kiezen: binnen R de echte boom, daarbuiten de grove. Alleen opnieuw indelen als de camera een paar meter verplaatst is.
    const R = this.treeRange = Q.boomBereik;
    const last = this._treeCam;
    if (last && Math.hypot(last[0] - cam.x, last[1] - cam.z) < 3) return;
    this._treeCam = [cam.x, cam.z];
    for (const t of this.treeTiles) {
      if (!t.hasNear) continue;
      const dx = Math.max(t.minX - cam.x, 0, cam.x - t.maxX), dz = Math.max(t.minZ - cam.z, 0, cam.z - t.maxZ);
      const minD = Math.hypot(dx, dz);
      const maxD = Math.hypot(Math.max(Math.abs(cam.x - t.minX), Math.abs(cam.x - t.maxX)), Math.max(Math.abs(cam.z - t.minZ), Math.abs(cam.z - t.maxZ)));
      const mode = minD >= R ? 'far' : maxD < R ? 'near' : 'mix';
      if (mode === t.mode && mode !== 'mix') continue;
      t.mode = mode;
      this.splitTreeTile(t, cam, R);
    }
  }

  // Bomen tijdelijk weghalen (bijv. rond het podium van de Bierfeesten, zodat ze het zicht niet blokkeren).
  // pred(x, z) zegt welke bomen weg moeten, binnen straal R rond het middelpunt. Geeft een functie terug die ze terugzet.
  hideTrees(pred, [cx, cz], R) {
    const hidden = [];
    const tiles = (this.treeTiles || []).filter((t) => Math.hypot(Math.max(t.minX - cx, 0, cx - t.maxX), Math.max(t.minZ - cz, 0, cz - t.maxZ)) < R);
    for (const t of tiles) for (const r of t.recs) {
      if (!r.hidden && Math.hypot(r.x - cx, r.z - cz) < R && pred(r.x, r.z)) { r.hidden = true; hidden.push(r); }
    }
    const refresh = () => {
      const cam = this._treeCam || [cx, cz];
      const RR = this.treeRange || (this.isMobile ? 120 : 200);
      for (const t of tiles) this.splitTreeTile(t, { x: cam[0], z: cam[1] }, RR);
    };
    refresh();
    return () => { for (const r of hidden) r.hidden = false; refresh(); };
  }

  splitTreeTile(t, cam, R) {
    let fc = 0;
    const nc = t.nearMeshes.map(() => 0);
    const tm = t.trunk.instanceMatrix.array, cm = t.canopy.instanceMatrix.array, cc = t.canopy.instanceColor?.array;
    for (const r of t.recs) {
      if (r.hidden) continue;
      const nm = r.vi >= 0 ? t.nearMeshes[r.vi] : null;
      if (nm && Math.hypot(r.x - cam.x, r.z - cam.z) < R) {
        const i = nc[r.vi]++;
        nm.br.instanceMatrix.array.set(r.nm, i * 16); nm.lf.instanceMatrix.array.set(r.nm, i * 16);
      } else {
        tm.set(r.fm, fc * 16); cm.set(r.fm, fc * 16); if (cc) cc.set(r.c, fc * 3);
        fc++;
      }
    }
    t.trunk.count = t.canopy.count = fc;
    t.trunk.instanceMatrix.needsUpdate = t.canopy.instanceMatrix.needsUpdate = true;
    if (t.canopy.instanceColor) t.canopy.instanceColor.needsUpdate = true;
    t.nearMeshes.forEach((nm, vi) => {
      if (!nm) return;
      nm.br.count = nm.lf.count = nc[vi];
      nm.br.instanceMatrix.needsUpdate = nm.lf.instanceMatrix.needsUpdate = true;
    });
    t.far.visible = fc > 0;
    t.near.visible = nc.some((n) => n > 0);
  }

  buildProps() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const rand = rng(42);
    const place = (inst, list, yaw = () => rand() * Math.PI * 2, lift = 0) => {
      list.forEach(([x, z], i) => {
        p.set(x, this.groundAt(x, z) + lift, z);
        q.setFromAxisAngle(up, yaw(x, z));
        m.compose(p, q, one);
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      this.scene.add(inst);
    };
    // richting naar de dichtstbijzijnde straat, zodat banken en borden logisch staan
    const faceStreet = (x, z) => {
      const s = this.nearestStreet(x, z);
      return s ? Math.atan2(s.x - x, s.z - z) : 0;
    };

    // Bankjes en fietsenrekken op een logische plek: staat er een gevel vlakbij (of staat het object er half in),
    // dan met de rug of lange kant netjes tegen de gevel; anders van de rijbaan af en met de voorkant naar de straat.
    const settle = (x, z, back) => {
      const wall = this.nearestWall(x, z, 2.6);
      if (wall && (wall.inside || wall.d < back + 0.6)) {
        const sx = wall.px + wall.nx * back, sz = wall.pz + wall.nz * back;
        if (!this.insideBuilding(sx, sz) && this.classAt(sx, sz) !== 'rijbaan') return { x: sx, z: sz, yaw: Math.atan2(wall.nx, wall.nz), wall };
      }
      const o = this.offRoad(x, z, 4);
      if (!o) return null;
      return { x: o[0], z: o[1], yaw: faceStreet(o[0], o[1]), wall: null };
    };
    const placeSettled = (inst, list) => {
      list.forEach((sp, i) => {
        p.set(sp.x, this.groundAt(sp.x, sp.z), sp.z);
        q.setFromAxisAngle(up, sp.yaw);
        m.compose(p, q, one);
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = true; inst.receiveShadow = true;
      this.scene.add(inst);
    };
    const benches = this.objects.furniture.filter((f) => f[0] === 'bank').map(([, x, z]) => settle(x, z, 0.55)).filter(Boolean);
    this.benchSpots = benches; // voor mensen die op een bankje zitten (pedestrians.js)
    const benchGeo = mergeGeometries([
      box(1.8, 0.06, 0.45, 0, 0.45, 0), box(1.8, 0.4, 0.05, 0, 0.72, -0.22, -0.12),
      box(0.06, 0.45, 0.45, -0.8, 0.22, 0), box(0.06, 0.45, 0.45, 0.8, 0.22, 0),
    ]);
    placeSettled(new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.75 }), benches.length), benches);
    // afvalbakken: groen, naast ongeveer de helft van de bankjes
    const bins = [];
    benches.forEach((b, i) => {
      if (i % 2) return;
      const ux = Math.cos(b.yaw), uz = -Math.sin(b.yaw); // langs het bankje
      const bx = b.x + ux * 1.3, bz = b.z + uz * 1.3;
      if (!this.insideBuilding(bx, bz) && this.classAt(bx, bz) !== 'rijbaan') bins.push({ x: bx, z: bz, yaw: b.yaw });
    });
    const binGeo = mergeGeometries([cyl(0.24, 0.22, 0.85, 0, 0.43, 0), cyl(0.26, 0.26, 0.06, 0, 0.88, 0), cyl(0.03, 0.03, 0.9, 0, 0.45, -0.28)]);
    placeSettled(new THREE.InstancedMesh(binGeo, new THREE.MeshStandardMaterial({ color: 0x2e5d3a, roughness: 0.6, metalness: 0.2 }), bins.length), bins);

    const tables = this.objects.furniture.filter((f) => f[0] === 'picknicktafel').map(([, x, z]) => [x, z]);
    const tableGeo = mergeGeometries([
      box(1.8, 0.06, 0.8, 0, 0.75, 0), box(1.8, 0.05, 0.3, 0, 0.45, 0.6), box(1.8, 0.05, 0.3, 0, 0.45, -0.6),
      box(0.08, 0.75, 1.5, -0.7, 0.37, 0), box(0.08, 0.75, 1.5, 0.7, 0.37, 0),
    ]);
    place(new THREE.InstancedMesh(tableGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 }), tables.length), tables);

    const racks = this.objects.furniture.filter((f) => f[0] === 'fietsenrek').map(([, x, z]) => settle(x, z, 0.7)).filter(Boolean);
    const rackParts = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI);
      g.translate(-1 + i * 0.5, 0.35, 0);
      rackParts.push(g);
    }
    placeSettled(new THREE.InstancedMesh(mergeGeometries(rackParts), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.35 }), racks.length), racks);
    // fietsen in de rekken: haaks in het rek (voorwiel in een beugel), hoogstens twee per rek met ruimte ertussen,
    // en bij rekken vlak naast elkaar maar in één ervan fietsen, zodat het niet rommelig wordt
    const bikeSpots = (this.bikeSpots = []);
    const used = [];
    racks.forEach((r) => {
      if (used.some((u) => Math.hypot(u.x - r.x, u.z - r.z) < 4)) return;
      used.push(r);
      const n = Math.floor(rand() * 3); // 0, 1 of 2 fietsen
      const slots = [0, 2, 4].sort(() => rand() - 0.5).slice(0, n);
      const ux = Math.cos(r.yaw), uz = -Math.sin(r.yaw); // langs het rek
      const nx = Math.sin(r.yaw), nz = Math.cos(r.yaw); // van de gevel af
      for (const slot of slots) {
        const off = -1 + slot * 0.5;
        bikeSpots.push({ x: r.x + ux * off + nx * 0.25, z: r.z + uz * off + nz * 0.25, yaw: r.yaw });
      }
    });
    const wheel = (zz) => { const g = new THREE.TorusGeometry(0.33, 0.025, 5, 18); g.rotateY(Math.PI / 2); g.translate(0, 0.35, zz); return g; };
    const bar = (len, y, zz, rx) => { const g = new THREE.CylinderGeometry(0.018, 0.018, len, 5); g.rotateX(rx); g.translate(0, y, zz); return g; };
    const bikeGeo = mergeGeometries([wheel(0.52), wheel(-0.52), bar(0.95, 0.62, 0, Math.PI / 2), bar(0.55, 0.5, -0.25, 0.5), bar(0.6, 0.55, 0.3, -0.45), box(0.08, 0.04, 0.22, 0, 0.88, -0.3), box(0.5, 0.025, 0.025, 0, 0.98, 0.45)]);
    const bikes = new THREE.InstancedMesh(bikeGeo, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), Math.max(1, bikeSpots.length));
    const bcol = new THREE.Color();
    bikeSpots.forEach((b, i) => {
      p.set(b.x, this.groundAt(b.x, b.z) + 0.04, b.z); q.setFromAxisAngle(up, b.yaw); m.compose(p, q, one); bikes.setMatrixAt(i, m); // wielen op de grond
      bikes.setColorAt(i, bcol.set([0x212121, 0x1565c0, 0xc62828, 0xeceff1, 0x2e7d32, 0x6d4c41, 0xf9a825][Math.floor(rand() * 7)]));
    });
    bikes.count = bikeSpots.length; bikes.castShadow = !this.isMobile;
    this.scene.add(bikes);

    // lantaarnpalen met arm en armatuur: die uit de kaart (BGT), aangevuld langs alle straten
    const lights = this.streetLamps();
    this.lampList = lights;
    const poleGeo = mergeGeometries([
      cyl(0.06, 0.1, 6, 0, 3, 0), cyl(0.04, 0.04, 1.2, 0, 6, 0.55, Math.PI / 2),
      box(0.3, 0.12, 0.5, 0, 5.98, 1.1),
    ]);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.6 }), lights.length);
    const lampGeo = new THREE.BoxGeometry(0.24, 0.04, 0.42);
    lampGeo.translate(0, 5.9, 1.1);
    this.lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffb866, emissiveIntensity: 0 });
    const lamps = new THREE.InstancedMesh(lampGeo, this.lampMaterial, lights.length);
    const lightYaw = (x, z) => faceStreet(x, z);
    lights.forEach(([x, z], i) => {
      p.set(x, this.groundAt(x, z), z);
      q.setFromAxisAngle(up, lightYaw(x, z));
      m.compose(p, q, one);
      poles.setMatrixAt(i, m);
      lamps.setMatrixAt(i, m);
    });
    poles.castShadow = true;
    this.scene.add(poles, lamps);

    // lichtvlekken op de grond
    const glowTex = radialTexture();
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xffb760, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glowGeo = new THREE.PlaneGeometry(16, 16);
    glowGeo.rotateX(-Math.PI / 2);
    const glows = new THREE.InstancedMesh(glowGeo, this.glowMaterial, lights.length);
    lights.forEach(([x, z], i) => {
      const yaw = lightYaw(x, z);
      const gx = x + Math.sin(yaw) * 1.1, gz = z + Math.cos(yaw) * 1.1;
      p.set(gx, this.groundAt(gx, gz) + 0.2, gz);
      m.compose(p, new THREE.Quaternion(), one);
      glows.setMatrixAt(i, m);
    });
    glows.renderOrder = 2;
    // op de computer geven de lantaarns echt licht (zie bakeLamps); de platte lichtvlek is er alleen nog voor de telefoon
    if (Q.laag) this.scene.add(glows);
    else this.buildLampCones(lights, lightYaw);

    // verkeersborden, paaltjes en vlaggenmasten
    const poleList = this.objects.poles || [];
    const signs = poleList.filter((x) => x[0] === 'verkeersbordpaal').map(([, x, z]) => [x, z]);
    const bollards = poleList.filter((x) => x[0] === 'afsluitpaal' || x[0] === 'poller').map(([, x, z]) => [x, z]);
    const flags = poleList.filter((x) => x[0] === 'vlaggenmast').map(([, x, z]) => [x, z]);
    const signPole = mergeGeometries([cyl(0.04, 0.04, 2.6, 0, 1.3, 0)]);
    place(new THREE.InstancedMesh(signPole, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 }), signs.length), signs, faceStreet);
    // bordschijf: voorkant als cirkel (dan staat '30' rechtop), rode rand en een witte achterkant
    const front = new THREE.CircleGeometry(0.32, 24);
    front.translate(0, 2.35, 0.065);
    const rim = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 24, 1, true);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 2.35, 0.05);
    for (let i = 0; i < rim.attributes.uv.count; i++) rim.attributes.uv.setXY(i, 0.5, 0.92);
    const back = new THREE.CircleGeometry(0.32, 24);
    back.rotateY(Math.PI);
    back.translate(0, 2.35, 0.035);
    for (let i = 0; i < back.attributes.uv.count; i++) back.attributes.uv.setXY(i, 0.02, 0.02);
    const signFace = mergeGeometries([front, rim, back]);
    place(new THREE.InstancedMesh(signFace, new THREE.MeshStandardMaterial({ map: signFaceTexture(), roughness: 0.4 }), signs.length), signs, faceStreet);
    const bollardGeo = mergeGeometries([cyl(0.07, 0.08, 0.9, 0, 0.45, 0), cyl(0.075, 0.075, 0.08, 0, 0.75, 0)]);
    place(new THREE.InstancedMesh(bollardGeo, new THREE.MeshStandardMaterial({ color: 0x5a1e1e, roughness: 0.5, metalness: 0.3 }), bollards.length), bollards);
    place(new THREE.InstancedMesh(cyl(0.05, 0.07, 8, 0, 4, 0), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.5, roughness: 0.3 }), flags.length), flags);
  }

  setNight(t) {
    this.nightUniform.value = t;
    if (this.lampMaterial) this.lampMaterial.emissiveIntensity = t * 7;
    if (this.glowMaterial) this.glowMaterial.opacity = t * 0.55;
    if (this.coneMaterial) { this.coneMaterial.uniforms.opacity.value = t * 0.16; this.coneMesh.visible = t > 0.02; }
    setLampGlobals(t, this.wet || 0);
  }

  // De kaart levert maar een handvol lantaarns. Hier komen er langs alle straten bij: om de 30 meter,
  // om en om links en rechts, net naast de rijbaan, en nooit vlak bij een lantaarn die er al staat.
  streetLamps() {
    const out = this.objects.lights.map(([x, z]) => [x, z]);
    const cell = 24, grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const put = (x, z) => { const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z]); };
    const near = (x, z, d) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [px, pz] of grid.get((cx + i) + ',' + (cz + j)) || []) if (Math.hypot(px - x, pz - z) < d) return true;
      return false;
    };
    out.forEach(([x, z]) => put(x, z));
    const road = (c) => c === 'rijbaan' || c === 'klinkers' || c === 'parkeer' || c === 'fietspad';
    const b = this.coreBox;
    const start = this.spotNear(5, 25);
    let side = 1;
    for (const [name, line] of this.roads) {
      if (!name || /voetpad|fietspad/i.test(name)) continue;
      let acc = 12;
      for (let i = 0; i + 3 < line.length; i += 2) {
        const ax = line[i], az = line[i + 1], bx = line[i + 2], bz = line[i + 3];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx;
        for (let s = 0; s < len; s += 2) {
          acc += 2;
          if (acc < 30) continue;
          const px = ax + dx * s, pz = az + dz * s;
          if (px < b.x0 + 20 || px > b.x1 - 20 || pz < b.z0 + 20 || pz > b.z1 - 20) continue;
          if (!road(this.classAt(px, pz))) continue;
          for (const sd of [side, -side]) {
            // rand van de rijbaan zoeken
            let d = 1.5;
            while (d < 9 && road(this.classAt(px + nx * sd * d, pz + nz * sd * d))) d += 0.5;
            if (d >= 9) continue;
            const lx = px + nx * sd * (d + 0.45), lz = pz + nz * sd * (d + 0.45);
            if (this.classAt(lx, lz) === 'water' || this.insideBuilding(lx, lz) || near(lx, lz, 21)) continue;
            if (Math.hypot(lx - start[0], lz - start[1]) < 12) continue; // niet pal voor de camera op het startpunt
            const wall = this.nearestWall(lx, lz, 0.5);
            if (wall) continue;
            out.push([lx, lz]); put(lx, lz);
            acc = 0; side = -side;
            break;
          }
        }
      }
    }
    return out;
  }

  // Zachte lichtkegel onder elke lantaarn: je ziet het licht in de avondnevel hangen.
  buildLampCones(lights, yawOf) {
    const geo = new THREE.CylinderGeometry(0.12, 2.9, 5.7, 20, 1, true);
    geo.translate(0, 5.85 - 2.85, 0);
    // bovenaan helder, onderaan uitgedoofd
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(Math.max(0, pos.getY(i) / 5.85), 2.2); col[i * 3] = k; col[i * 3 + 1] = k * 0.74; col[i * 3 + 2] = k * 0.42; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // eigen shader: de kegel dooft uit naar zijn rand (waar je er schuin langs kijkt), zodat je geen harde vorm ziet
    this.coneMaterial = new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: `attribute vec3 color; varying vec3 vCol; varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(instanceMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vCol = color;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `uniform float opacity; varying vec3 vCol; varying vec3 vN; varying vec3 vV;
        void main(){
          float edge = abs(dot(normalize(vN), normalize(vV)));
          gl_FragColor = vec4(vCol * opacity * edge * edge * edge, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const im = new THREE.InstancedMesh(geo, this.coneMaterial, lights.length);
    const m = new THREE.Matrix4();
    lights.forEach(([x, z], i) => {
      const yaw = yawOf(x, z);
      m.makeTranslation(x + Math.sin(yaw) * 1.1, this.groundAt(x, z), z + Math.cos(yaw) * 1.1);
      im.setMatrixAt(i, m);
    });
    im.visible = false; im.renderOrder = 3;
    im.computeBoundingSphere();
    this.scene.add(im);
    this.coneMesh = im;
  }

  // extra lichtbron (bijv. een etalage): plek, hoogte boven de grond en sterkte
  addLightSource(x, z, h = 2.7, power = 0.7) { (this.extraLights ||= []).push([x, z, this.groundAt(x, z) + h, power]); }

  // Kaart met lichtbronnen voor het lantaarnlicht (zie lighting.js): per vakje van 2 m de dichtstbijzijnde bron.
  bakeLamps() {
    if (Q.laag) return;
    const b = this.coreBox, res = 2, R = 25;
    const W = Math.ceil((b.x1 - b.x0) / res), H = Math.ceil((b.z1 - b.z0) / res);
    const best = new Float32Array(W * H);
    const data = new Uint16Array(W * H * 4);
    const hf = THREE.DataUtils.toHalfFloat;
    const src = [];
    for (const [x, z] of this.lampList || []) {
      const s = this.nearestStreet(x, z);
      const yaw = s ? Math.atan2(s.x - x, s.z - z) : 0;
      src.push([x + Math.sin(yaw) * 1.1, z + Math.cos(yaw) * 1.1, this.groundAt(x, z) + 5.85, 1]);
    }
    for (const e of this.extraLights || []) src.push(e);
    // per vakje wint de bron die daar op de grond het meeste licht geeft (zelfde formule als in de shader):
    // zo zit er op de grens tussen twee lampen geen sprong in het licht
    const sm = (a, c, v) => { const t = Math.min(1, Math.max(0, (v - a) / (c - a))); return t * t * (3 - 2 * t); };
    for (const [x, z, y, power] of src) {
      const c0 = Math.max(0, Math.floor((x - R - b.x0) / res)), c1 = Math.min(W - 1, Math.floor((x + R - b.x0) / res));
      const r0 = Math.max(0, Math.floor((z - R - b.z0) / res)), r1 = Math.min(H - 1, Math.floor((z + R - b.z0) / res));
      const gy = this.groundAt(x, z);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const cx = b.x0 + (c + 0.5) * res, cz = b.z0 + (r + 0.5) * res;
        const h = y - gy, d2 = (cx - x) ** 2 + (cz - z) ** 2 + h * h;
        if (d2 >= 620) continue;
        const dy = h / Math.sqrt(d2);
        const val = power * (1 - d2 / 620) / (1 + d2 * 0.028) * sm(0.2, 0.85, dy) * dy;
        const i = r * W + c;
        if (val <= best[i]) continue;
        best[i] = val;
        data[i * 4] = hf(x - cx); data[i * 4 + 1] = hf(z - cz); data[i * 4 + 2] = hf(y); data[i * 4 + 3] = hf(power);
      }
    }
    setLampMap(data, W, H, [b.x0, b.z0, W * res, H * res]);
    console.info(`lantaarnlicht: ${src.length} lichtbronnen`);
  }

  // ------------------------------------------------------------ straatnamen

  buildStreetIndex() {
    this.segments = [];
    for (const [name, line] of this.roads) {
      if (!name) continue;
      for (let i = 0; i < line.length - 2; i += 2) {
        this.segments.push([name, line[i], line[i + 1], line[i + 2], line[i + 3]]);
      }
    }
  }

  // dichtstbijzijnde straat; geeft {name, x, z, dist}
  nearestStreet(x, z, filter) {
    let best = null;
    for (const [name, ax, az, bx, bz] of this.segments) {
      if (filter && name !== filter) continue;
      const ex = bx - ax, ez = bz - az;
      const len2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
      const px = ax + ex * t, pz = az + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.dist) best = { name, x: px, z: pz, dist: d };
    }
    return best;
  }

  // alle lijnstukken van één straat als aaneengesloten route
  streetPath(name) {
    const pieces = this.roads.filter(([n]) => n === name).map(([, l]) => {
      const pts = [];
      for (let i = 0; i < l.length; i += 2) pts.push([l[i], l[i + 1]]);
      return pts;
    });
    if (!pieces.length) return [];
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5;
    let chains = pieces.map((p) => p.slice());
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < chains.length; i++) {
        for (let j = 0; j < chains.length; j++) {
          if (i === j) continue;
          const a = chains[i], b = chains[j];
          let joined = null;
          if (near(a[a.length - 1], b[0])) joined = a.concat(b.slice(1));
          else if (near(a[a.length - 1], b[b.length - 1])) joined = a.concat(b.slice(0, -1).reverse());
          else if (near(a[0], b[b.length - 1])) joined = b.concat(a.slice(1));
          else if (near(a[0], b[0])) joined = b.slice().reverse().concat(a.slice(1));
          if (joined) {
            chains = chains.filter((_, k) => k !== i && k !== j);
            chains.push(joined);
            merged = true;
            break outer;
          }
        }
      }
    }
    const length = (c) => c.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]) : 0), 0);
    chains.sort((a, b) => length(b) - length(a));
    return chains[0];
  }

  // vrij plekje op straat bij een adres, voor NPC's
  spotNear(x, z) {
    const s = this.nearestStreet(x, z);
    if (!s) return [x, z];
    // vanaf de weg een stukje richting het adres, maar niet in een gebouw
    const dx = x - s.x, dz = z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    let best = [s.x, s.z];
    for (let t = 0; t < Math.min(d, 12); t += 0.5) {
      const px = s.x + (dx / d) * t, pz = s.z + (dz / d) * t;
      if (this.insideBuilding(px, pz)) break;
      best = [px, pz];
    }
    const back = Math.max(0, Math.hypot(best[0] - s.x, best[1] - s.z) - 1.2);
    return this.resolve(s.x + (dx / d) * back, s.z + (dz / d) * back, 0.6);
  }
}

// ------------------------------------------------------------ hulpfuncties

function gridIndex(w, h) {
  const idx = new Uint32Array((w - 1) * (h - 1) * 6);
  let k = 0;
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const a = r * w + c, b = a + 1, d = a + w, e = d + 1;
      idx[k++] = a; idx[k++] = d; idx[k++] = b;
      idx[k++] = b; idx[k++] = d; idx[k++] = e;
    }
  }
  return new THREE.BufferAttribute(idx, 1);
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// geometrie <-> base64 (voor het boombestand)
function b64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str, Type) {
  const bin = atob(str);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Type(u8.buffer);
}
function encodeGeo(g) {
  return { pos: b64(new Float32Array(g.attributes.position.array)), uv: b64(new Float32Array(g.attributes.uv.array)), idx: b64(new Uint16Array(g.index.array)) };
}
function decodeGeo(e) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(unb64(e.pos, Float32Array), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(unb64(e.uv, Float32Array), 2));
  g.setIndex(new THREE.BufferAttribute(unb64(e.idx, Uint16Array), 1));
  return g;
}

function mergeBlobs(rand) {
  const parts = [
    [0, 6.6, 0, 2.5], [1.0, 6.0, 0.6, 1.9], [-0.9, 6.2, -0.5, 2.0], [0.1, 7.8, -0.1, 1.7], [0.4, 5.6, -1.0, 1.5],
  ];
  const positions = [];
  for (const [x, y, z, r] of parts) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const j = 1 + (Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * 0.08);
      positions.push(p.getX(i) * j + x, p.getY(i) * j + y, p.getZ(i) * j + z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function box(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, x, y, z, rx = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 8);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

// rond verkeersbord (blauw gebodsbord / rood-wit verbodsbord, gemengd via de UV)
function signFaceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fillStyle = '#c62828'; g.fill();
  g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.fillStyle = '#111'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('30', 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Even-odd scanline-rastering van alle grondvlakken (in tekenvolgorde) naar klasse+1 per pixel.
function rasterClasses(polys, W, H, x0, z0, scale) {
  const grid = new Uint8Array(W * H);
  const xs = [];
  for (const [cls, rings] of polys) {
    let minY = Infinity, maxY = -Infinity;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) { const y = (r[i] - z0) * scale; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
    const v = cls + 1;
    for (let py = y0; py <= y1; py++) {
      const sy = py + 0.5;
      xs.length = 0;
      for (const r of rings) {
        const n = r.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ay = (r[i * 2 + 1] - z0) * scale, by = (r[j * 2 + 1] - z0) * scale;
          if ((ay > sy) === (by > sy)) continue;
          const ax = (r[i * 2] - x0) * scale, bx = (r[j * 2] - x0) * scale;
          xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, c) => a - c);
      const row = py * W;
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let px = from; px <= to; px++) grid[row + px] = v;
      }
    }
  }
  return grid;
}
