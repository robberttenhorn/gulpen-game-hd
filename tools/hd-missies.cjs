// Loopt alle missies kort na: naar de persoon toe, het gesprek door (eerste keuze), wachten tot er iets
// begint (minispel, race, binnenruimte, bezorging), wat willekeurige invoer geven en dan 'Stoppen'.
// Controleert dat er geen fouten in de console komen en dat je daarna weer vrij kunt rondlopen.
// Gebruik: npm run build && npx vite preview --port 4173 &   en dan   node tools/hd-missies.cjs [filter]
//   KLAAR=1: alle missies staan vooraf als gedaan (test of je ze opnieuw kunt doen).
//   BEELD=1: per missie ook één echt beeld tekenen (vangt shaderfouten; traag zonder videokaart).
// De weergave staat verder uit: zonder videokaart kost één beeld seconden, de spellogica loopt zo op volle snelheid.
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4173/';
const filter = process.argv[2] || '';
const BEELD = !!process.env.BEELD;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.setDefaultTimeout(900000);
  const errors = [];
  let current = 'laden';
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${current}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[${current}] pageerror: ${e.message}`));
  await page.goto(URL + (process.env.QUERY || ''));
  await page.waitForSelector('#start-btn:not([hidden])');
  // KLAAR=1: alle missies vooraf als gedaan markeren (ook de finale), om te zien of je ze opnieuw kunt doen
  if (process.env.KLAAR) {
    await page.evaluate(() => {
      const ids = game.missions.list().map((m) => m.id).concat(['finale']);
      const key = Object.keys(localStorage).find((k) => k.endsWith('missies-v2')) || (location.pathname.includes('gulpen-game-hd') ? 'gulpehd-' : 'gulpe-') + 'missies-v2';
      localStorage.setItem(key, JSON.stringify(ids));
    });
    await page.reload();
    await page.waitForSelector('#start-btn:not([hidden])');
  }
  await page.evaluate(() => {
    const g = window.game;
    g._render = g.render.bind(g);
    g.render = () => {};
    g.adaptQuality = () => {}; g.checkBlack = () => {};
    // overgangen (zwart scherm) versnellen: de test hoeft er niet naar te kijken
    window._st = window.setTimeout;
  });
  await page.click('#start-btn');
  // introductie doorklikken
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    const open = await page.evaluate(() => { if (game.ui.dialogOpen) { game.input.actionPressed = true; return true; } return false; });
    if (!open && i > 3) break;
  }
  const ids = await page.evaluate(() => game.missions.list().map((m) => ({ id: m.id, title: m.title, night: !!m.nightOnly })));
  console.log(ids.length, 'missies');
  const results = [];
  for (const m of ids) {
    if (filter && !m.id.includes(filter)) continue;
    current = m.id;
    const before = errors.length;
    const r = await page.evaluate(async ({ m, BEELD }) => {
      const g = window.game, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const mis = g.missions.list().find((q) => q.id === m.id);
      const out = { id: m.id, reached: '', steps: 0 };
      // dag of avond zoals de missie het wil
      const wantNight = m.night || m.id === 'bierfeesten';
      if ((g.night > 0.5) !== wantNight) { g.timeOfDay = wantNight ? 22.5 : 15; g.applyTime(); }
      g.updateDayNight = () => {};
      if (g.mode === 'car') { g.car.speed = 0; g.exitCar(); }
      if (g.mode !== 'walk') g.setMode('walk');
      const p = g.player;
      [p.x, p.z] = g.world.resolve(mis.npc.pos.x + 1.6, mis.npc.pos.z + 1.6, 0.5);
      p.speed = 0; p.lockedFor = false;
      g.talkCooldownUntil = 0; g.ui.closedAt = 0; g.unlockUntil = 0; g.ui.cancelUntil = 0;
      g.missions.talk(mis.npc);
      const t0 = performance.now();
      const started = () => g.minigame || g.race || g.penalty || g.interior || g.destination || g.missions.active || g.pov;
      let quiet = 0;
      while (performance.now() - t0 < 45000) {
        await wait(120);
        if (g.ui.dialogOpen) {
          quiet = 0; out.steps++;
          const btn = document.querySelector('#dialog-choices button');
          if (btn) btn.click(); else g.input.actionPressed = true;
        } else if (started() && !g.fading) {
          if (++quiet > 12) break; // ruim een seconde geen gesprek meer en er loopt iets
        } else if (!g.missions.talking && !g.fading) {
          if (++quiet > 12) break;
        }
      }
      out.reached = g.minigame ? 'minispel' : g.race ? 'race' : g.penalty ? 'penalty' : g.interior ? 'binnen' : g.destination ? 'bestemming' : g.missions.active ? 'missie actief' : 'gesprek klaar';
      // wat invoer geven: lopen, actieknop, sturen
      const keys = ['KeyW', 'KeyA', 'KeyD', 'Space', 'KeyE'];
      for (let i = 0; i < 12; i++) {
        const k = keys[i % keys.length];
        window.dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k, bubbles: true }));
        g.input.actionPressed = i % 3 === 0;
        await wait(120);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: k, key: k, bubbles: true }));
        const el = document.querySelector('.mini-overlay button, .mini-overlay [data-k]');
        if (el && i % 4 === 1) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
      if (BEELD) { try { g._render(0.016); const gl = g.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch (e) { out.renderError = String(e); } }
      // stoppen en kijken of je weer vrij bent
      if (g.missions.busy()) g.missions.stop();
      const t1 = performance.now();
      while (performance.now() - t1 < 8000 && (g.fading || g.interior)) await wait(150);
      await wait(1700);
      out.free = !g.missions.busy() && !p.lockedFor && !g.ui.dialogOpen && !g.minigame && !g.interior && Number.isFinite(p.x) && Number.isFinite(p.z);
      out.overlay = document.querySelectorAll('.mini-overlay').length;
      if (!out.free) { out.state = { busy: g.missions.busy(), locked: p.lockedFor, dialog: g.ui.dialogOpen, mini: !!g.minigame, interior: !!g.interior, active: g.missions.active?.id || null }; try { g.goHome(); } catch (e) { out.homeError = String(e); } await wait(500); }
      return out;
    }, { m, BEELD });
    r.errors = errors.slice(before);
    results.push(r);
    console.log(`${r.free && !r.errors.length ? 'ok ' : 'LET OP'} ${m.id.padEnd(16)} ${r.reached.padEnd(14)} stappen ${r.steps}${r.overlay ? ' overlay blijft staan: ' + r.overlay : ''}${r.state ? ' ' + JSON.stringify(r.state) : ''}${r.errors.length ? ' FOUTEN: ' + r.errors.join(' | ') : ''}`);
  }
  const bad = results.filter((r) => !r.free || r.errors.length);
  console.log(`klaar: ${results.length} missies nagelopen, ${bad.length} met een opmerking, ${errors.length} fouten in de console`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
