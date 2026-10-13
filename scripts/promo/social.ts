// Immagine di anteprima per GitHub e per i social (1280×640), disegnata con i caratteri e i pezzi dell'app.
// Serve l'app in esecuzione: node scripts/promo/social.ts [http://localhost:8787]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8787';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1, bypassCSP: true, serviceWorkers: 'block' });
await page.goto(`${base}/#/gioca?go=1&mode=local`);
await page.waitForSelector('.game-layout cg-board piece');
await page.evaluate(() => document.fonts.ready);

// Qualche mossa, per non mostrare la posizione di partenza.
for (const move of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']) {
  for (const sq of [move.slice(0, 2), move.slice(2)]) {
    const box = (await page.locator('cg-board').boundingBox())!;
    await page.mouse.click(box.x + ((sq.charCodeAt(0) - 97 + 0.5) * box.width) / 8, box.y + ((8 - Number(sq[1]) + 0.5) * box.height) / 8);
    await page.waitForTimeout(330);
  }
}
await page.waitForTimeout(500);
const board = `data:image/png;base64,${(await page.locator('.board-frame').screenshot()).toString('base64')}`;

await page.evaluate((src) => {
  const card = document.createElement('div');
  card.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;gap:70px;padding:0 90px;color:#f4ede1;' +
    'background:radial-gradient(700px 500px at 78% 50%, rgba(226,183,106,.3), transparent 70%), radial-gradient(600px 400px at 0% 0%, rgba(226,183,106,.14), transparent 70%), #0d0b09;';
  card.innerHTML = `
    <div style="flex:1">
      <svg viewBox="0 0 32 32" width="84" height="84" style="color:#e2b76a"><path d="M9 27h14l-1.200-4H10.200L9 27Zm2-6h10c0-5-2-6.500-2-10.500 2-.700 3.300-2.600 3.300-4.700l-2.700 1.400L17.800 4 16 6.600 14.200 4l-1.800 3.200-2.700-1.400c0 2.100 1.300 4 3.300 4.700 0 4-2 5.500-2 10.500Z" fill="currentColor"/></svg>
      <div style="font:500 104px/1 'Fraunces Variable',serif;letter-spacing:-.035em;margin:10px 0 14px">Gambetto</div>
      <div style="font:italic 400 34px 'Fraunces Variable',serif;color:#f7dca0">Scacchi, con stile.</div>
      <div style="font:600 21px/1.5 'Manrope Variable',sans-serif;color:#cfc5b4;margin-top:26px;max-width:520px">Gioca contro il computer o con gli amici, impara con lezioni interattive, allena aperture e trappole.</div>
      <div style="font:800 14px 'Manrope Variable',sans-serif;letter-spacing:.26em;text-transform:uppercase;color:#a69c8c;margin-top:30px">Gratis · Senza pubblicità · Open source</div>
    </div>
    <img src="${src}" style="width:440px;border-radius:16px;transform:perspective(1400px) rotateY(-14deg) rotateX(5deg);box-shadow:0 40px 90px rgba(0,0,0,.75),0 0 0 1px rgba(226,183,106,.3)">`;
  document.body.append(card);
}, board);
await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))));

mkdirSync('promo', { recursive: true });
await page.screenshot({ path: 'promo/anteprima-social.png' });
await browser.close();
console.log('promo/anteprima-social.png');
