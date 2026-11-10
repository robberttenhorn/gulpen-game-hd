// Maakt vaste screenshots van de game (overdag, gouden uur en 's avonds, computer- en telefoonformaat)
// en meet hoe lang één beeld kost.
// Gebruik: npm run build && npx vite preview --port 4173 &   en dan   node tools/hd-shots.cjs <uitvoermap> [filter]
//   filter: deel van de naam (bijv. "dag-markt"), of "alleen-computer" / "alleen-telefoon"; KORT=1 maakt alleen de kernset.
// Draait in Chromium zonder videokaart (SwiftShader). Eén beeld kost daar seconden, dus het script zet de
// spellus stil en tekent zelf beeld voor beeld. De gemeten tijd per beeld is alleen bruikbaar om versies
// onderling te vergelijken, niet als maat voor een echte laptop of telefoon.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4173/';
const out = path.resolve(process.argv[2] || 'docs/hd/shots');
const filter = process.argv[3] || '';
const KORT = !!process.env.KORT;
fs.mkdirSync(out, { recursive: true });

// vaste standpunten: plek van de speler, kijkrichting van de camera
const VIEWS = [
  { name: 'markt', start: true, yaw: 0.2, pitch: 0.24, kern: true },
  { name: 'rijksweg', x: 150, z: -12, yaw: 1.9, pitch: 0.16, kern: true },
  { name: 'looierstraat', x: 60, z: -34, yaw: -0.6, pitch: 0.18 },
  { name: 'kerk', x: -120, z: 40, yaw: 1.2, pitch: 0.12 },
  { name: 'tuin38', x: 452, z: -305, yaw: 2.6, pitch: 0.3, kern: true },
  { name: 'gulp', gulp: true, yaw: 0, pitch: 0.3, kern: true },
  { name: 'gulperberg', x: 560, z: 120, yaw: 1.9, pitch: 0.2 },
  { name: 'woonwijk', x: 420, z: -230, yaw: 0.4, pitch: 0.22 },
  { name: 'auto', car: true, x: 235, z: -30, yaw: 1.2, pitch: 0.2 },
  { name: 'gras', grass: true, yaw: 2.4, pitch: 0.1 },
  ...(process.env.FRAME ? [{ name: 'gevel-' + process.env.FRAME, frame: process.env.FRAME, yaw: 0, pitch: 0.2 }] : []),
];
const TIMES = [['dag', 15], ['gouden-uur', 18.6], ['avond', 22]];

async function open(browser, mobile) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(900000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL + (process.env.QUERY || ''));
  await page.waitForSelector('#start-btn:not([hidden])');
  // spellus stilzetten vóór de start: vanaf hier tekent het script zelf
  await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop = () => {};
    g.adaptQuality = () => {}; g.dawn = async () => {}; g.updateDayNight = () => {}; g.checkBlack = () => {};
  });
  await page.click('#start-btn');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => game.ui.dialogOpen)) && i > 1) break;
    await page.evaluate(() => { const d = document.getElementById('dialog'); d && d.click(); });
  }
  return { page, ctx, errors };
}

// standpunt en uur instellen, een paar beelden tekenen (zodat alles is bijgewerkt) en het canvas uitlezen
async function shot(page, v, hour, file) {
  const data = await page.evaluate(({ v, hour, pre }) => {
    const g = window.game;
    let x = v.x, z = v.z;
    if (v.start) [x, z] = g.startPos;
    // voor een gevel (bijv. FRAME=donnys): een eind van de gevel af, kijkend naar de gevel
    if (v.frame && g.facades.frames[v.frame]) { const f = g.facades.frames[v.frame]; x = f.x + f.nx * 12 + f.ux * 2.5; z = f.z + f.nz * 12 + f.uz * 2.5; v = { ...v, yaw: Math.atan2(f.nx, f.nz) + 0.25 }; }
    // midden in een grasveld (dichtstbijzijnde bij het dorp, met rondom ook gras)
    if (v.grass) {
      const w = g.world, isG = (a, b) => w.classAt(a, b) === 'gras' && !w.insideBuilding(a, b);
      find: for (let r = 60; r < 700; r += 12) for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2, px = 150 + Math.cos(a) * r, pz = -60 + Math.sin(a) * r;
        if ([[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, -6], [14, 0], [0, 14]].every(([dx, dz]) => isG(px + dx, pz + dz))) { x = px; z = pz; break find; }
      }
    }
    // aan de oever van de Gulp, met het water voor je
    if (v.gulp && g.fishing) { const f = g.fishing; x = f.x; z = f.z; v = { ...v, yaw: Math.atan2(f.x - f.wx, f.z - f.wz) + 0.35 }; }
    if (g.mode === 'car') { g.car.speed = 0; g.exitCar(); }
    const p = g.player;
    [p.x, p.z] = g.world.resolve(x, z, 0.5);
    p.heading = v.yaw + Math.PI; p.speed = 0;
    if (v.car && g.volvo) {
      // naast de Volvo XC40 op de oprit van Ringweg 38, schuin van voren
      const c = g.volvo, h = c.heading + 0.1;
      const cx = c.x + Math.sin(h) * 8.6, cz = c.z + Math.cos(h) * 8.6; // camera schuin voor de auto
      p.x = c.x + Math.sin(h + 0.75) * 4.4; p.z = c.z + Math.cos(h + 0.75) * 4.4; // speler ernaast
      const yaw = Math.atan2(cx - p.x, cz - p.z);
      p.heading = yaw + Math.PI;
      v = { ...v, yaw, pitch: 0.16 };
      g.camDistSave ??= g.camDist; g.camDist = Math.hypot(cx - p.x, cz - p.z);
    } else if (g.camDistSave != null) { g.camDist = g.camDistSave; g.camDistSave = null; }
    g.camYaw = v.yaw; g.camPitch = v.pitch; g.lastManualLook = g.time + 1e6;
    if (g.timeOfDay !== hour) { g.timeOfDay = hour; g.applyTime(); }
    if (pre) (0, eval)(pre); // PRE=...: eigen code vóór de opname (om iets te proberen of te controleren)
    const gl = g.renderer.getContext(), px = new Uint8Array(4);
    const t0 = performance.now();
    g.clock.getDelta();
    for (let i = 0; i < 3; i++) { g.tickInner(); g.updateCamera(0, true); }
    g.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = performance.now() - t0;
    return { url: g.canvas.toDataURL('image/jpeg', 0.9), ms };
  }, { v, hour, pre: process.env.PRE || '' });
  fs.writeFileSync(file, Buffer.from(data.url.split(',')[1], 'base64'));
  return data.ms;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = {};
  for (const mobile of [false, true]) {
    const tag = mobile ? 'telefoon' : 'computer';
    if (filter.includes('alleen-computer') && mobile) continue;
    if (filter.includes('alleen-telefoon') && !mobile) continue;
    const { page, ctx, errors } = await open(browser, mobile);
    for (const [tname, hour] of TIMES) {
      for (const v of VIEWS) {
        if (KORT && !(v.kern && tname !== 'gouden-uur') && !(tname === 'gouden-uur' && v.name === 'markt')) continue;
        if (KORT && mobile && !(v.name === 'markt' || (v.name === 'rijksweg' && tname === 'dag'))) continue;
        if (mobile && !['markt', 'rijksweg', 'tuin38', 'gulp'].includes(v.name)) continue;
        if (tname === 'gouden-uur' && !['markt', 'gulperberg', 'woonwijk', 'gulp'].includes(v.name)) continue;
        if (tname === 'avond' && ['gulperberg', 'woonwijk', 'gras'].includes(v.name)) continue;
        const id = `${tag}-${tname}-${v.name}`;
        if (filter && !filter.startsWith('alleen-') && !id.includes(filter)) continue;
        const ms = await shot(page, v, hour, path.join(out, id + '.jpg'));
        console.log('gemaakt', id, Math.round(ms) + ' ms');
      }
    }
    if (filter && !filter.startsWith('alleen-')) { await ctx.close(); if (errors.length) console.log(tag, 'fouten:', errors); continue; } // losse opname: geen meting
    // tijd per beeld: op de Markt, overdag, drie beelden na elkaar (eerst opwarmen)
    await shot(page, VIEWS[0], 15, path.join(out, `${tag}-dag-markt.jpg`));
    const info = await page.evaluate(() => {
      const g = window.game, gl = g.renderer.getContext(), px = new Uint8Array(4), ts = [];
      for (let i = 0; i < 3; i++) { const t = performance.now(); g.tickInner(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); }
      // driehoeken en tekenopdrachten van één heel beeld (alle stappen samen: schaduwkaart, wereld, nabewerking)
      const r = g.renderer.info;
      r.autoReset = false; r.reset(); g.tickInner(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { msPerBeeld: Math.round(Math.min(...ts)), driehoeken: r.render.triangles, tekenopdrachten: r.render.calls, pixelverhouding: g.renderer.getPixelRatio(), kwaliteit: g.quality?.name || null, texturen: r.memory.textures, geometrie: r.memory.geometries };
    });
    report[tag] = { ...info, fouten: errors };
    console.log(tag, JSON.stringify(report[tag]));
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'meting.json'), JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
