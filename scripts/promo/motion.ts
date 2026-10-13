// Video promozionali in grafica animata, costruiti con vere schermate dell'app.
// Ogni fotogramma viene disegnato a un istante preciso, quindi il risultato è fluido a 30 fotogrammi al secondo.
//   node scripts/promo/motion.ts                 entrambi i video, nei due formati
//   node scripts/promo/motion.ts teaser          solo il teaser (16 s)
//   node scripts/promo/motion.ts presentazione   solo la presentazione (60 s)
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { WebSocket } from 'ws';

const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
const FPS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// WSL tiene occupata per qualche istante la cartella in cui ha appena lavorato: la cancellazione va ritentata.
const RETRY = { maxRetries: 20, retryDelay: 500 };
const kinds = (process.argv.slice(2).length ? process.argv.slice(2) : ['teaser', 'presentazione']) as ('teaser' | 'presentazione')[];
const full = kinds.includes('presentazione');

const dataDir = mkdtempSync(join(tmpdir(), 'gambetto-motion-'));
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((r) => server.stdout.once('data', () => r()));

// Due account dimostrativi per la scena della partita online.
const register = async (username: string) => {
  const res = await fetch(`${BASE}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: `promo-${username}-locale` }) });
  return res.headers.get('set-cookie')!.split(';')[0];
};
const playerCookie = await register('Giulia');
const friendCookie = await register('Marco');

const FORMATS = [
  { suffix: '', w: 1280, h: 720, scale: 1.5, vertical: false },
  { suffix: '-verticale', w: 540, h: 960, scale: 2, vertical: true },
];

// ── Schermate vere dell'app, catturate al momento ──
function tools(page: Page) {
  const jpeg = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`;
  const still = async (selector: string) => {
    const loc = page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded();
    await sleep(250);
    return jpeg(await loc.screenshot({ type: 'jpeg', quality: 90 }));
  };
  const screen = async () => jpeg(await page.screenshot({ type: 'jpeg', quality: 90 }));
  const move = async (m: string) => {
    for (const sq of [m.slice(0, 2), m.slice(2, 4)]) {
      await page.locator('cg-board').scrollIntoViewIfNeeded();
      const box = (await page.locator('cg-board').boundingBox())!;
      await page.mouse.click(box.x + ((sq.charCodeAt(0) - 97 + 0.5) * box.width) / 8, box.y + ((8 - Number(sq[1]) + 0.5) * box.height) / 8);
      await sleep(330);
    }
    await sleep(350);
  };
  const play = async (moves: string[]) => {
    for (const m of moves) await move(m);
  };
  const open = async (hash: string, wait: string) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForSelector(wait);
    await sleep(700);
  };
  return { still, screen, move, play, open };
}

async function captureStills(browser: Browser, page: Page) {
  const { still, move, play, open } = tools(page);
  await page.goto(`${BASE}/`);
  await page.waitForSelector('cg-board piece');
  await page.evaluate(() => document.fonts.ready);
  // La barra in alto resta fissa durante lo scorrimento e finirebbe dentro le schermate.
  await page.addStyleTag({ content: '.topbar, .site-notice { display: none !important; }' });

  // Una partita mossa per mossa.
  await open('/gioca?go=1&mode=local&n=1', '.game-layout cg-board piece');
  const game = [await still('.board-frame')];
  for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']) {
    await move(m);
    game.push(await still('.board-frame'));
  }
  const board = game.at(-1)!;

  // Le cinque scacchiere.
  const themes: string[] = [];
  for (const theme of ['noce', 'smeraldo', 'ardesia', 'ametista', 'carbone']) {
    await page.evaluate((t) => {
      const el = document.querySelector('.board-frame')!;
      el.className = el.className.replace(/theme-\w+/, `theme-${t}`);
    }, theme);
    themes.push(await still('.board-frame'));
  }

  // Analisi di una partita finita con il matto del barbiere.
  await open('/gioca?go=1&mode=local&n=2', '.game-layout cg-board piece');
  await play(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']);
  await page.waitForSelector('.modal.result');
  await page.locator('.modal').getByRole('button', { name: /Analizza/ }).click();
  await page.waitForSelector('.review-summary', { timeout: 60000 });
  await page.keyboard.press('ArrowLeft');
  await sleep(400);
  await page.getByRole('button', { name: /Mostra/ }).click();
  await sleep(600);
  const analysisBoard = await still('.board-row');
  const review = await still('.review');

  await open('/impara', '.lesson-grid');
  const lessons = await still('.lesson-grid');

  // Il matto di Legal, posizione per posizione.
  await open('/aperture/legal', '.line-view cg-board piece');
  const legalLine = [await still('.board-frame')];
  for (let i = 0; i < 13; i++) {
    await page.keyboard.press('ArrowRight');
    await sleep(420);
    legalLine.push(await still('.board-frame'));
  }
  const legal = legalLine.at(-1)!;

  await open('/aperture?tab=chicche', '.line-grid');
  const traps = await still('.line-grid');

  const base = { board, game, themes, analysisBoard, review, lessons, legal, legalLine, traps };
  if (!full) return { ...base, hint: board, lessonBoard: board, lessonPanel: review, openings: traps, levels: lessons, online: board, invite: review, phoneHome: board, phoneGame: board };

  await open('/aperture', '.line-grid');
  const openings = await still('.line-grid');

  await open('/gioca', '.level-grid');
  const levels = await still('.level-grid');

  // Lezione: spiegazione con la freccia, poi il pannello dell'esercizio.
  await open('/impara/intermedio/forchetta', '.lesson cg-board piece');
  const lessonBoard = await still('.board-frame');
  await page.getByRole('button', { name: /Avanti/ }).click();
  await sleep(700);
  const lessonPanel = await still('.lesson-panel');

  // Contro il computer: una mossa, la risposta, poi il suggerimento.
  await open('/gioca?go=1&mode=cpu&color=white&n=3', '.game-layout cg-board piece');
  await move('e2e4');
  await page.waitForFunction(() => document.querySelector('.status-line')?.textContent?.includes('Tocca a te'), undefined, { timeout: 20000 });
  await sleep(500);
  await page.getByRole('button', { name: /Suggerimento/ }).click();
  await page.waitForSelector('.cg-shapes line', { timeout: 20000 }).catch(() => undefined);
  await sleep(500);
  const hint = await still('.board-row');

  // Partita online: Giulia crea, Marco entra dal link e risponde.
  const [name, value] = playerCookie.split('=');
  await page.context().addCookies([{ name, value, url: BASE }]);
  await page.goto(`${BASE}/#/online`);
  await page.reload();
  await page.addStyleTag({ content: '.topbar, .site-notice { display: none !important; }' });
  await page.getByRole('button', { name: /Crea la partita/ }).waitFor();
  await page.getByRole('button', { name: 'Bianco' }).click();
  await page.getByRole('button', { name: /Crea la partita/ }).click();
  await page.waitForSelector('.invite-link');
  // Nel video il link deve mostrare un indirizzo credibile, non quello di prova.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.invite-link input')!;
    input.value = input.value.replace(/^https?:\/\/[^/]+\//, 'https://scacchi.heptagram.it/');
  });
  const invite = await still('.gate.invite');
  const gameId = (await page.evaluate(() => location.hash)).split('/').pop()!;
  const replies = ['e7e5', 'b8c6', 'g8f6'];
  const friend = new WebSocket(`ws://localhost:${PORT}/ws?game=${gameId}`, { headers: { Cookie: friendCookie } });
  friend.on('message', (data) => {
    const msg = JSON.parse(String(data));
    if (msg.t !== 'state' || msg.status !== 'active' || msg.moves.length % 2 === 0) return;
    const reply = replies[(msg.moves.length - 1) / 2];
    if (reply) setTimeout(() => friend.send(JSON.stringify({ t: 'move', from: reply.slice(0, 2), to: reply.slice(2) })), 300);
  });
  await page.waitForSelector('.game-layout cg-board piece');
  for (const m of ['e2e4', 'g1f3', 'f1c4']) {
    await move(m);
    await page.waitForFunction(() => document.querySelector('.status-line')?.textContent?.includes('Tocca a te'), undefined, { timeout: 15000 });
    await sleep(400);
  }
  const online = await still('.board-col');
  friend.close();

  // Due schermate così come appaiono su un telefono.
  const phone = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'it-IT' });
  const mobile = await phone.newPage();
  const m = tools(mobile);
  await mobile.goto(`${BASE}/`);
  await mobile.waitForSelector('cg-board piece');
  await sleep(600);
  const phoneHome = await m.screen();
  await m.open('/gioca?go=1&mode=local&n=4', '.game-layout cg-board piece');
  await m.play(['d2d4', 'g8f6', 'c2c4', 'e7e6']);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const phoneGame = await m.screen();
  await phone.close();

  return { ...base, hint, lessonBoard, lessonPanel, openings, levels, online, invite, phoneHome, phoneGame };
}
type Stills = Awaited<ReturnType<typeof captureStills>>;

// ── La scena: HTML e CSS. Tutte le animazioni sono in pausa e vengono portate all'istante voluto. ──
// I nomi delle classi non devono coincidere con quelli dell'app, che resta caricata sotto.
const CSS = `
#teaser { position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; background: #0a0806; color: #f4ede1; font-family: 'Manrope Variable', sans-serif; --u: 1vw; }
#teaser.v { --u: 1.9vw; }
#teaser, #teaser * { box-sizing: border-box; animation-play-state: paused !important; }
#teaser .sc { position: absolute; inset: 0; visibility: hidden; animation: t-show var(--d) linear var(--s); }
@keyframes t-show { from, to { visibility: visible; } }
#teaser .in { position: absolute; inset: 0; animation: t-out .22s cubic-bezier(.6, 0, .9, .4) calc(var(--s) + var(--d) - .22s) forwards; }
@keyframes t-out { to { transform: scale(1.3); opacity: 0; filter: blur(14px); } }
#teaser .glow { position: absolute; inset: -25%; background: radial-gradient(closest-side at 68% 46%, var(--c1), transparent 72%), radial-gradient(closest-side at 18% 80%, rgba(255,255,255,.05), transparent 60%);
  animation: t-drift var(--d) linear var(--s) both; }
#teaser.v .glow { background: radial-gradient(closest-side at 50% 66%, var(--c1), transparent 72%); }
@keyframes t-drift { from { transform: translate(-3%, 2%) scale(1); } to { transform: translate(3%, -2%) scale(1.18); } }

#teaser .txt { position: absolute; left: 6vw; top: 50%; width: 46vw; transform: translateY(-52%); }
#teaser.v .txt { left: 7vw; top: 10.500vh; width: 86vw; transform: none; }
#teaser .eyebrow { font-weight: 800; font-size: calc(var(--u) * 1.15); letter-spacing: .28em; text-transform: uppercase; color: var(--c2); animation: t-fade .4s ease calc(var(--s) + .04s) both; }
#teaser.v .eyebrow { font-size: 2.700vw; }
#teaser .word { margin: .08em 0 .12em; font: 500 calc(var(--u) * 9.400)/.98 'Fraunces Variable', serif; letter-spacing: -.035em; white-space: nowrap; overflow: hidden; padding: .06em 0 .12em; }
#teaser .word span { display: inline-block; animation: t-letter .55s cubic-bezier(.2, 1.55, .35, 1) calc(var(--s) + var(--i) * .034s) both; }
#teaser .word .pt { color: var(--c2); }
@keyframes t-letter { from { transform: translateY(115%) rotate(9deg); opacity: 0; } }
#teaser .sub { font-weight: 600; font-size: calc(var(--u) * 2.050); line-height: 1.3; color: #d6ccba; animation: t-fade .5s ease calc(var(--s) + .42s) both; }
#teaser.v .sub { font-size: 4.700vw; }
#teaser .sub b { color: var(--c2); font-family: 'Fraunces Variable', serif; font-weight: 600; font-size: 1.25em; }
@keyframes t-fade { from { opacity: 0; transform: translateY(1.200em); } }

#teaser .shot { position: absolute; right: 5.500vw; top: 50%; width: 37vw; aspect-ratio: 1 / 1; object-fit: cover; object-position: center; border-radius: 1.300vw; overflow: hidden; background: #14110d;
  box-shadow: 0 3vw 8vw rgba(0,0,0,.75), 0 0 0 1px rgba(255,236,208,.22), 0 0 9vw -2vw var(--c1); animation: t-shot var(--d) cubic-bezier(.16, .84, .3, 1) var(--s) both; }
@keyframes t-shot {
  0% { opacity: 0; transform: translateY(-50%) perspective(1500px) rotateY(-46deg) rotateX(16deg) translateX(34%) scale(.78); }
  22% { opacity: 1; transform: translateY(-50%) perspective(1500px) rotateY(-17deg) rotateX(7deg) translateX(0) scale(1); }
  100% { opacity: 1; transform: translateY(-50%) perspective(1500px) rotateY(-8deg) rotateX(3deg) translateX(-2%) scale(1.08); }
}
#teaser.v .shot { right: auto; left: 8vw; top: auto; bottom: 6.500vh; width: 84vw; border-radius: 3vw; animation-name: t-shot-v; }
@keyframes t-shot-v {
  0% { opacity: 0; transform: perspective(1500px) rotateX(38deg) translateY(30%) scale(.8); }
  22% { opacity: 1; transform: perspective(1500px) rotateX(13deg) translateY(0) scale(1); }
  100% { opacity: 1; transform: perspective(1500px) rotateX(5deg) translateY(-2%) scale(1.07); }
}
#teaser .shot.wide { aspect-ratio: 5 / 4; object-position: left top; }
#teaser .shot.tall { width: 31vw; aspect-ratio: 1 / 1.2; }
#teaser.v .shot.tall { width: 74vw; left: 13vw; }
#teaser .shot.back { width: 30vw; right: 20vw; filter: brightness(.55) blur(1.500px); animation-delay: calc(var(--s) - .05s); }
#teaser.v .shot.back { display: none; }
#teaser .seq img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; animation: t-on .08s linear calc(var(--s) + var(--at)) forwards; }
@keyframes t-on { to { opacity: 1; } }
#teaser .float { position: absolute; right: 3vw; bottom: 9vh; width: 24vw; max-height: 44vh; object-fit: cover; object-position: top; border-radius: 1vw; box-shadow: 0 2vw 5vw rgba(0,0,0,.8), 0 0 0 1px var(--c2);
  animation: t-float .6s cubic-bezier(.2, 1.4, .35, 1) calc(var(--s) + var(--at, .55s)) both; }
#teaser.v .float { right: 5vw; bottom: 5vh; width: 52vw; max-height: 24vh; border-radius: 2.400vw; }
@keyframes t-float { from { opacity: 0; transform: translateY(40%) scale(.7) rotate(6deg); } to { transform: rotate(-3deg); } }

#teaser .pc { position: absolute; width: 62vmin; height: 62vmin; opacity: .1; filter: blur(2px); animation: t-piece var(--d) linear var(--s) both; }
#teaser .pc piece { position: absolute; inset: 0; width: 100%; height: 100%; background-size: cover; filter: none; }
#teaser .pc.a { left: -12vmin; bottom: -16vmin; }
#teaser .pc.b { right: -10vmin; top: -18vmin; animation-direction: reverse; }
@keyframes t-piece { from { transform: rotate(-14deg) scale(1); } to { transform: rotate(6deg) scale(1.18); } }

#teaser .bars { display: flex; gap: .7vw; height: calc(var(--u) * 3.400); margin-top: calc(var(--u) * 1.600); align-items: flex-end; }
#teaser .bars i { flex: none; width: calc(var(--u) * 2.200); height: calc(18% + var(--i) * 11.700%); border-radius: .4vw; background: var(--c2); transform-origin: bottom;
  animation: t-bar .22s cubic-bezier(.2, 1.6, .4, 1) calc(var(--s) + .5s + var(--i) * .125s) both; }
#teaser.v .bars { height: 8vw; gap: 1.400vw; margin-top: 3.500vw; }
#teaser.v .bars i { width: 5vw; border-radius: 1vw; }
@keyframes t-bar { from { transform: scaleY(.05); opacity: .15; } }

#teaser .chips { display: flex; flex-wrap: wrap; gap: .6em; margin-top: calc(var(--u) * 1.600); font-weight: 700; font-size: calc(var(--u) * 1.450); }
/* In verticale le etichette stanno su una riga sola, altrimenti finirebbero dietro la scacchiera. */
#teaser.v .chips { flex-wrap: nowrap; gap: .4em; font-size: 2.800vw; margin-top: 4vw; white-space: nowrap; }
#teaser.v .chips span { padding: .42em .8em; }
#teaser .chips span { padding: .42em 1.050em; border-radius: 99px; border: 1px solid var(--c2); color: var(--c2); background: rgba(255,255,255,.05);
  animation: t-chip .4s cubic-bezier(.2, 1.6, .35, 1) calc(var(--s) + 1s + var(--i) * .2s) both; }
@keyframes t-chip { from { opacity: 0; transform: scale(.4) translateY(1em); } }

#teaser .stamp { position: absolute; right: 4vw; top: 16vh; padding: .25em .7em; font: 600 italic calc(var(--u) * 3.400) 'Fraunces Variable', serif; color: #0a0806; background: var(--c2); border-radius: .25em;
  box-shadow: 0 1.500vw 4vw rgba(0,0,0,.6); animation: t-stamp .28s cubic-bezier(.3, 1.6, .5, 1) calc(var(--s) + var(--at, 1s)) both; }
#teaser.v .stamp { right: 5vw; top: auto; bottom: 54vh; font-size: 7vw; }
@keyframes t-stamp { from { transform: rotate(-9deg) scale(3.400); opacity: 0; } to { transform: rotate(-9deg) scale(1); } }

#teaser .duel { display: flex; align-items: center; gap: 1.400vw; margin-top: calc(var(--u) * 1.800); font-weight: 800; font-size: calc(var(--u) * 1.700); }
#teaser.v .duel { font-size: 4vw; gap: 3vw; margin-top: 4vw; }
#teaser .who { display: flex; align-items: center; gap: .6em; padding: .45em 1em .45em .45em; border-radius: 99px; background: rgba(255,244,228,.09); border: 1px solid rgba(255,236,208,.25); }
#teaser .who i { display: grid; place-items: center; width: 1.900em; height: 1.900em; border-radius: 50%; font-style: normal; color: #0a0806; background: var(--c2); }
#teaser .who.l { animation: t-left .45s cubic-bezier(.2, 1.4, .35, 1) calc(var(--s) + .5s) both; }
#teaser .who.r { animation: t-right .45s cubic-bezier(.2, 1.4, .35, 1) calc(var(--s) + .75s) both; }
#teaser .vs { font: italic 500 1.300em 'Fraunces Variable', serif; color: var(--c2); animation: t-fade .3s ease calc(var(--s) + 1s) both; }
@keyframes t-left { from { opacity: 0; transform: translateX(-120%); } }
@keyframes t-right { from { opacity: 0; transform: translateX(120%); } }

#teaser .phone { position: absolute; top: 50%; width: 16.500vw; aspect-ratio: 390 / 780; border-radius: 2.300vw; border: .5vw solid #2e261c; overflow: hidden; background: #000;
  box-shadow: 0 3vw 7vw rgba(0,0,0,.8), 0 0 0 1px rgba(255,236,208,.25), 0 0 8vw -2vw var(--c1); }
#teaser .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
#teaser .phone.p1 { right: 26vw; animation: t-phone1 var(--d) cubic-bezier(.16, .84, .3, 1) var(--s) both; }
#teaser .phone.p2 { right: 7vw; animation: t-phone2 var(--d) cubic-bezier(.16, .84, .3, 1) calc(var(--s) + .14s) both; }
@keyframes t-phone1 { 0% { opacity: 0; transform: translateY(-10%) rotate(-16deg); } 22% { opacity: 1; transform: translateY(-52%) rotate(-6deg); } 100% { opacity: 1; transform: translateY(-56%) rotate(-4deg); } }
@keyframes t-phone2 { 0% { opacity: 0; transform: translateY(-90%) rotate(18deg); } 22% { opacity: 1; transform: translateY(-46%) rotate(7deg); } 100% { opacity: 1; transform: translateY(-42%) rotate(5deg); } }
#teaser.v .phone { top: auto; width: 39vw; border-radius: 5.500vw; border-width: 1.100vw; }
#teaser.v .phone.p1 { right: auto; left: 8vw; bottom: 7vh; animation-name: t-phone1v; }
#teaser.v .phone.p2 { right: 8vw; bottom: 11vh; animation-name: t-phone2v; }
@keyframes t-phone1v { 0% { opacity: 0; transform: translateY(40%) rotate(-16deg); } 22% { opacity: 1; transform: rotate(-6deg); } 100% { opacity: 1; transform: translateY(-3%) rotate(-4deg); } }
@keyframes t-phone2v { 0% { opacity: 0; transform: translateY(50%) rotate(18deg); } 22% { opacity: 1; transform: rotate(7deg); } 100% { opacity: 1; transform: translateY(3%) rotate(5deg); } }

#teaser .flash { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 50% 50%, #fff3d0, #e2b76a); opacity: 0; animation: t-flash .22s ease-out var(--s) forwards; }
@keyframes t-flash { 0% { opacity: .6; } 100% { opacity: 0; } }

#teaser .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
#teaser .logo { width: calc(var(--u) * 8.500); height: calc(var(--u) * 8.500); color: #e2b76a; filter: drop-shadow(0 0 3vw rgba(226,183,106,.7)); animation: t-logo .7s cubic-bezier(.2, 1.7, .35, 1) calc(var(--s) + .02s) both; }
@keyframes t-logo { from { transform: scale(0) rotate(-40deg); opacity: 0; } }
#teaser .bname { display: block; font: 500 calc(var(--u) * 10.500)/1 'Fraunces Variable', serif; letter-spacing: -.035em; overflow: hidden; padding: .05em .06em .14em; }
#teaser.v .bname { font-size: 16.500vw; }
#teaser .bname span { display: inline-block; animation: t-letter .6s cubic-bezier(.2, 1.5, .35, 1) calc(var(--s) + .16s + var(--i) * .045s) both; }
#teaser .tagline { font: italic 400 calc(var(--u) * 3.300) 'Fraunces Variable', serif; color: #f7dca0; animation: t-fade .6s ease calc(var(--s) + var(--at, .75s)) both; }
#teaser .caps { margin-top: 1.600em; font-weight: 800; font-size: calc(var(--u) * 1.150); letter-spacing: .3em; text-transform: uppercase; color: #a69c8c; animation: t-fade .6s ease calc(var(--s) + 1.500s) both; }
#teaser .row { display: flex; gap: 1vw; margin-bottom: calc(var(--u) * 1.400); }
#teaser .row .pc { position: relative; width: calc(var(--u) * 4.600); height: calc(var(--u) * 4.600); opacity: 1; filter: drop-shadow(0 .6vw 1vw rgba(0,0,0,.7)); animation: t-rise .5s cubic-bezier(.2, 1.6, .35, 1) calc(var(--s) + 1s + var(--i) * .07s) both; }
@keyframes t-rise { from { transform: translateY(160%) scale(.4); opacity: 0; } }
#teaser .pulse { position: absolute; left: 50%; top: 50%; width: 10vmin; height: 10vmin; margin: -5vmin; border-radius: 50%; border: .5vmin solid #f7dca0; opacity: 0; animation: t-ring 1.100s cubic-bezier(.1, .7, .2, 1) var(--s) forwards; }
@keyframes t-ring { from { opacity: .9; transform: scale(.2); } to { opacity: 0; transform: scale(16); } }
#teaser .black { position: absolute; inset: 0; background: #000; opacity: 0; animation: t-black .9s ease-in calc(var(--total) - .95s) forwards; }
@keyframes t-black { to { opacity: 1; } }
`;

const LOGO =
  '<svg class="logo" viewBox="0 0 32 32"><path d="M9 27h14l-1.200-4H10.200L9 27Zm2-6h10c0-5-2-6.500-2-10.500 2-.700 3.300-2.600 3.300-4.700l-2.700 1.400L17.800 4 16 6.600 14.200 4l-1.800 3.200-2.700-1.400c0 2.100 1.300 4 3.300 4.700 0 4-2 5.500-2 10.500Z" fill="currentColor"/></svg>';
const letters = (text: string) => [...text].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
const piece = (kind: string, cls: string) => `<div class="pc cg-wrap ${cls}"><piece class="${kind} white"></piece></div>`;
const text = (eyebrow: string, word: string, sub: string, extra = '') =>
  `<div class="txt"><div class="eyebrow">${eyebrow}</div><div class="word">${letters(word)}<span class="pt" style="--i:${word.length}">.</span></div><div class="sub">${sub}</div>${extra}</div>`;
const bars = `<div class="bars">${Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>`;
const chips = (...labels: string[]) => `<div class="chips">${labels.map((l, i) => `<span style="--i:${i}">${l}</span>`).join('')}</div>`;
const duel = `<div class="duel"><span class="who l"><i>G</i>Giulia</span><span class="vs">vs</span><span class="who r"><i>M</i>Marco</span></div>`;
const row = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].map((k, i) => `<div class="pc cg-wrap" style="--i:${i}"><piece class="${k} white"></piece></div>`).join('');
/** Più immagini nello stesso riquadro, che si susseguono: la prima a `from` secondi dall'inizio della scena, le altre ogni `step`. */
const sequence = (images: string[], from: number, step: number, cls = '') =>
  `<div class="shot seq ${cls}">${images.map((src, i) => `<img src="${src}" style="--at:${i ? (from + i * step).toFixed(2) : 0}s">`).join('')}</div>`;
/** Numero che sale da zero: `at` è l'istante assoluto di partenza. */
const count = (to: number, at: number) => `<b data-count="${to}" data-at="${at.toFixed(2)}" data-dur="1.1">0</b>`;
const closing = `<div class="pulse"></div><div class="center"><div class="row">${row}</div>${LOGO}<div class="bname">${letters('Gambetto')}</div><div class="tagline" style="--at:.9s">Gratis. Senza pubblicità.</div><div class="caps">Gioca · Impara · Sfida gli amici</div></div>`;
const opening = `<div class="center">${LOGO}<div class="bname">${letters('Gambetto')}</div><div class="tagline">Scacchi, con stile.</div></div>`;

interface Scene {
  dur: number;
  glow: string;
  accent: string;
  /** `t` è l'istante assoluto in cui la scena comincia. */
  html: (s: Stills, t: number) => string;
}

const GOLD = ['rgba(226,183,106,.32)', '#f1c97c'];
const GREEN = ['rgba(110,190,130,.28)', '#8fdba2'];
const VIOLET = ['rgba(160,125,220,.3)', '#c4a8f0'];
const BLUE = ['rgba(100,160,235,.3)', '#8ec0f5'];
const CORAL = ['rgba(236,140,110,.3)', '#f5a98c'];
const TEAL = ['rgba(90,200,190,.26)', '#86dcd2'];
const scene = (dur: number, [glow, accent]: string[], html: Scene['html']): Scene => ({ dur, glow, accent, html });

const STORYBOARDS: Record<'teaser' | 'presentazione', { music: string[]; scenes: Scene[] }> = {
  // 120 bpm: una scena ogni battuta (2 secondi).
  teaser: {
    music: ['teaser', '16'],
    scenes: [
      scene(2, GOLD, () => opening),
      scene(2, GOLD, (s) => `${piece('knight', 'a')}${text('Contro il computer', 'Gioca', '<b>8</b> livelli, dal principiante al Gran Maestro', bars)}<img class="shot" src="${s.board}">`),
      scene(2, GREEN, (s, t) => `${piece('bishop', 'b')}${text('Dalle regole ai finali', 'Impara', `${count(26, t + 0.35)} lezioni interattive`)}<img class="shot wide" src="${s.lessons}">`),
      scene(2, VIOLET, (s) => `${piece('queen', 'a')}${text('Aperture e trappole celebri', 'Stupisci', 'Il matto di Legal, il Fegatello, il barbiere…')}<img class="shot wide back" src="${s.traps}"><img class="shot" src="${s.legal}"><div class="stamp">Scacco matto!</div>`),
      scene(2, BLUE, (s, t) => `${piece('rook', 'b')}${text('Analisi a fine partita', 'Migliora', `Precisione ${count(94, t + 0.4)}% · scopri la mossa giusta`)}<img class="shot" src="${s.analysisBoard}"><img class="float" src="${s.review}">`),
      scene(2, CORAL, (s) => `${piece('king', 'a')}${text('Online, con un link', 'Sfida', 'Gioca con gli amici, ovunque siano', duel)}<img class="shot" src="${s.board}">`),
      scene(4, GOLD, () => closing),
    ],
  },
  // 100 bpm: una scena ogni due battute (4,8 secondi), finale di tre.
  presentazione: {
    music: ['long', '60', '4.8', '52.8'],
    scenes: [
      scene(4.8, GOLD, () => opening),
      scene(4.8, GOLD, (s) => `${piece('knight', 'a')}${text('Contro il computer', 'Gioca', '<b>8</b> livelli, dal principiante al Gran Maestro', bars)}${sequence(s.game, 0.9, 0.5)}`),
      scene(4.8, TEAL, (s) => `${piece('pawn', 'b')}${text('Mai da solo', 'Capisci', 'Un aiuto quando serve, senza fretta', chips('Suggerimento', 'Annulla mossa', 'Orologio', 'Valutazione'))}<img class="shot" src="${s.hint}">`),
      scene(4.8, GREEN, (s, t) => `${piece('bishop', 'a')}${text('Dalle regole ai finali', 'Impara', `${count(26, t + 0.4)} lezioni interattive in tre percorsi`, chips('Base', 'Intermedio', 'Avanzato'))}<img class="shot wide" src="${s.lessons}">`),
      scene(4.8, GREEN, (s) => `${piece('knight', 'b')}${text('Si impara facendo', 'Prova', 'Leggi, guarda la scacchiera, poi tocca a te')}<img class="shot" src="${s.lessonBoard}"><img class="float" src="${s.lessonPanel}" style="--at:1.4s">`),
      scene(4.8, VIOLET, (s, t) => `${piece('rook', 'a')}${text('Il repertorio dei campioni', 'Ricorda', `${count(17, t + 0.4)} aperture famose, mossa per mossa`, chips('Italiana', 'Spagnola', 'Siciliana', 'Gambetto di Donna'))}<img class="shot wide" src="${s.openings}">`),
      scene(4.8, VIOLET, (s, t) => `${piece('queen', 'b')}${text('Trappole e matti lampo', 'Stupisci', `${count(12, t + 0.4)} chicche: Legal, Fegatello, barbiere…`)}<img class="shot wide back" src="${s.traps}">${sequence(s.legalLine, 0.7, 0.23)}<div class="stamp" style="--at:3.85s">Scacco matto!</div>`),
      scene(4.8, BLUE, (s, t) => `${piece('rook', 'a')}${text('Analisi a fine partita', 'Migliora', `Precisione ${count(94, t + 0.5)}% · errori · mossa migliore`)}<img class="shot" src="${s.analysisBoard}"><img class="float" src="${s.review}" style="--at:1.3s">`),
      scene(4.8, CORAL, (s) => `${piece('king', 'b')}${text('Online, con un link', 'Sfida', 'Mandi un link e si gioca in tempo reale', duel)}<img class="shot tall" src="${s.online}"><img class="float" src="${s.invite}" style="--at:2.3s">`),
      scene(4.8, TEAL, (s) => `${piece('bishop', 'a')}${text('Telefono, tablet, computer', 'Ovunque', 'Si installa come un’app e funziona anche senza rete')}<div class="phone p1"><img src="${s.phoneHome}"></div><div class="phone p2"><img src="${s.phoneGame}"></div>`),
      scene(4.8, GOLD, (s) => `${piece('queen', 'b')}${text('A modo tuo', 'Tuo', 'Cinque scacchiere e i progressi salvati sul tuo account', chips('Noce', 'Smeraldo', 'Ardesia', 'Ametista', 'Carbone'))}${sequence(s.themes, 1, 0.72)}`),
      scene(7.2, GOLD, () => closing),
    ],
  },
};

function stageHtml(scenes: Scene[], stills: Stills) {
  let t = 0;
  const parts: string[] = [];
  const cuts: number[] = [];
  for (const sc of scenes) {
    if (t) cuts.push(t);
    parts.push(`<div class="sc" style="--s:${t.toFixed(2)}s;--d:${sc.dur}s;--c1:${sc.glow};--c2:${sc.accent}"><div class="glow"></div><div class="in">${sc.html(stills, t)}</div></div>`);
    t += sc.dur;
  }
  return { seconds: t, html: `${parts.join('')}${cuts.map((c) => `<div class="flash" style="--s:${c.toFixed(2)}s"></div>`).join('')}<div class="black"></div>` };
}

// FORMAT=vertical (o horizontal) limita il lavoro a un solo formato.
const wanted = FORMATS.filter((f) => !process.env.FORMAT || (process.env.FORMAT === 'vertical') === f.vertical);

for (const format of wanted) {
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${format.scale}`, `--window-size=${format.w},${format.h}`] });
  const context = await browser.newContext({ viewport: null, bypassCSP: true, serviceWorkers: 'block', locale: 'it-IT' });
  const page = await context.newPage();
  console.log(`Formato ${format.vertical ? 'verticale' : 'orizzontale'}: catturo le schermate…`);
  const stills = await captureStills(browser, page);
  await page.addStyleTag({ content: CSS });

  for (const kind of kinds) {
    const { music, scenes } = STORYBOARDS[kind];
    const { seconds, html } = stageHtml(scenes, stills);
    await page.evaluate(
      ({ html, vertical, seconds }) => {
        document.getElementById('teaser')?.remove();
        const stage = document.createElement('div');
        stage.id = 'teaser';
        if (vertical) stage.className = 'v';
        stage.style.setProperty('--total', `${seconds}s`);
        stage.innerHTML = html;
        document.body.append(stage);
        // Porta ogni animazione della scena all'istante t e aggiorna i contatori numerici.
        (window as unknown as { seek: (t: number) => void }).seek = (t) => {
          for (const a of document.getAnimations()) {
            const target = (a.effect as KeyframeEffect | null)?.target;
            if (target && stage.contains(target)) a.currentTime = t * 1000;
          }
          for (const el of stage.querySelectorAll<HTMLElement>('[data-count]')) {
            const k = Math.min(1, Math.max(0, (t - Number(el.dataset.at)) / Number(el.dataset.dur)));
            el.textContent = String(Math.round(Number(el.dataset.count) * (1 - (1 - k) ** 3)));
          }
        };
      },
      { html, vertical: format.vertical, seconds },
    );
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))));

    const name = `gambetto-${kind}${format.suffix}`;
    const dir = resolve('promo', `frames-${kind}${format.suffix}`);
    rmSync(dir, { recursive: true, force: true, ...RETRY });
    mkdirSync(dir, { recursive: true });
    const total = Math.round(seconds * FPS);
    // STEP=36 disegna solo un fotogramma ogni 36 (un'anteprima veloce), senza montare il video.
    const step = Number(process.env.STEP ?? 1);
    for (let f = 0; f < total; f += step) {
      await page.evaluate((t) => (window as unknown as { seek: (t: number) => void }).seek(t), f / FPS);
      await page.screenshot({ path: join(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
      if (f % 300 === 0) console.log(`  ${name}: fotogramma ${f}/${total}`);
    }

    if (step > 1) continue;

    // WSL lavora dalla cartella promo, non da quella dei fotogrammi: altrimenti la terrebbe occupata e non si potrebbe cancellare.
    const frames = `frames-${kind}${format.suffix}`;
    const wsl = (program: string, args: string[]) => {
      const r = spawnSync('wsl.exe', ['--cd', resolve('promo'), '-d', 'Ubuntu', '-u', 'root', '--', program, ...args], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`${program} ha fallito`);
    };
    wsl('python3', ['../scripts/promo/music.py', music[0], `${frames}/_music.wav`, ...music.slice(1)]);
    wsl('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`, '-i', `${frames}/_music.wav`, '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${name}.mp4`]);
    if (!process.env.KEEP_FRAMES) rmSync(dir, { recursive: true, force: true, ...RETRY });
    console.log(`  promo/${name}.mp4 (${seconds} s)`);
  }
  await browser.close();
}

server.kill();
await sleep(300);
try {
  rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* su Windows il file può restare bloccato per un attimo */
}
process.exit(0);
