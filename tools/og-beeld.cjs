// Maakt het beeld dat je ziet als je de link naar de game deelt (WhatsApp, Facebook, iMessage...): public/og.jpg.
// Een screenshot uit de game als achtergrond, met het logo eroverheen. 1200 x 630 pixels (de gangbare maat).
// Gebruik: node tools/og-beeld.cjs [achtergrond.jpg]   (standaard: docs/hd/na/computer-dag-gulperberg.jpg)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const bg = path.resolve(process.argv[2] || path.join(root, 'docs/hd/na/computer-dag-gulperberg.jpg'));
const data = 'data:image/jpeg;base64,' + fs.readFileSync(bg).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; }
  .bg { position: absolute; inset: 0; background: url(${data}) 0% 42% / 1420px auto; }
  /* links donkerder, zodat het logo goed leesbaar is en de foto rechts helder blijft */
  .shade { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(16,26,38,.86) 0%, rgba(16,26,38,.62) 34%, rgba(16,26,38,.08) 62%, rgba(16,26,38,0) 100%), linear-gradient(0deg, rgba(16,26,38,.5) 0%, rgba(16,26,38,0) 30%); }
  .box { position: absolute; left: 70px; top: 0; bottom: 0; width: 680px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; color: #fff; }
  .logo { margin: 0 0 0 6px; font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 150px; white-space: nowrap; line-height: .9; display: inline-flex; flex-direction: column; align-items: center; transform: rotate(-4deg); }
  .logo-main { display: inline-flex; align-items: flex-end; letter-spacing: .02em; color: #e8a33d; text-shadow: 0 8px 0 #b9741c, 0 18px 36px rgba(0,0,0,.45); }
  .logo-pin { width: .66em; height: .86em; margin: 0 .02em .04em; color: #e8a33d; filter: drop-shadow(0 8px 0 #b9741c) drop-shadow(0 16px 20px rgba(0,0,0,.4)); }
  .logo-place { margin-top: .12em; font-size: .36em; font-weight: 700; color: #fff; letter-spacing: .04em; background: #1d4e9e; padding: .08em .6em .02em; border-radius: .22em; box-shadow: 0 0 0 .07em #fff inset, 0 0 0 .09em #1d4e9e, 0 .18em .4em rgba(0,0,0,.45); transform: rotate(6deg); }
  .tag { margin: 34px 0 0; font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 36px; line-height: 1.1; white-space: nowrap; text-shadow: 0 2px 12px rgba(0,0,0,.5); }
  .sub { margin: 12px 0 0; font-size: 23px; line-height: 1.35; opacity: .92; text-shadow: 0 2px 10px rgba(0,0,0,.5); }
</style></head><body>
  <div class="bg"></div><div class="shade"></div>
  <div class="box">
    <h1 class="logo"><span class="logo-main">L<svg class="logo-pin" viewBox="0 0 64 84"><path d="M32 2C16 2 4 14 4 30c0 21 28 50 28 50s28-29 28-50C60 14 48 2 32 2z" fill="currentColor" stroke="#7a3d00" stroke-width="4"/><path d="M19 33 32 21l13 12v13H37v-8h-10v8h-8z" fill="#fff"/></svg>CALS</span><span class="logo-place">Gulpen</span></h1>
    <p class="tag">Van de Markt tot de Gulperberg</p>
    <p class="sub">Loop, fiets of rij door het echte Gulpen.<br>Gratis spelen in je browser.</p>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, 'public/og.jpg'), type: 'jpeg', quality: 86 });
  await browser.close();
  console.log('public/og.jpg', Math.round(fs.statSync(path.join(root, 'public/og.jpg')).size / 1024) + ' kB');
})().catch((e) => { console.error(e); process.exit(1); });
