// Maakt de app-iconen voor 'Zet op beginscherm': public/icon-192.png, icon-512.png en apple-touch-icon.png.
// De kaartspeld met het huisje uit het logo, op de blauwe achtergrond van het laadscherm.
// Gebruik: node tools/app-icoon.cjs
const path = require('path');
const { chromium } = require('playwright');

const html = (s) => `<!doctype html><html><body style="margin:0;width:${s}px;height:${s}px;background:radial-gradient(ellipse at 50% 32%, #3f729a 0%, #1b2a3a 78%);display:grid;place-items:center">
<svg viewBox="0 0 64 84" style="width:${s * 0.46}px;height:${s * 0.6}px;filter:drop-shadow(0 ${s * 0.025}px 0 #b9741c) drop-shadow(0 ${s * 0.05}px ${s * 0.06}px rgba(0,0,0,.4))">
<path d="M32 2C16 2 4 14 4 30c0 21 28 50 28 50s28-29 28-50C60 14 48 2 32 2z" fill="#e8a33d" stroke="#7a3d00" stroke-width="4"/><path d="M19 33 32 21l13 12v13H37v-8h-10v8h-8z" fill="#fff"/></svg></body></html>`;

(async () => {
  const browser = await chromium.launch();
  for (const [file, s] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 });
    await page.setContent(html(s));
    await page.screenshot({ path: path.join(__dirname, '..', 'public', file) });
    await page.close();
    console.log('public/' + file);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
