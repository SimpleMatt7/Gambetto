// Registra le scene dei video promozionali guidando l'app in un browser senza finestra.
// Ogni scena diventa una cartella di fotogrammi in promo/frames-h (o frames-v); il montaggio lo fa compose.ts.
//   node scripts/promo/record.ts                  formato orizzontale 1920×1080
//   FORMAT=vertical node scripts/promo/record.ts  formato verticale 1080×1920, con l'impaginazione da telefono
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type CDPSession, type Page } from 'playwright';
import { WebSocket } from 'ws';

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const VERTICAL = process.env.FORMAT === 'vertical';
const FRAMES = join('promo', VERTICAL ? 'frames-v' : 'frames-h');
// Finestra in punti CSS e fattore di scala: il prodotto dà i pixel del video.
const VIEW = VERTICAL ? { w: 540, h: 960, scale: 2 } : { w: 1280, h: 720, scale: 1.5 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Server temporaneo con due account dimostrativi ──
const dataDir = mkdtempSync(join(tmpdir(), 'gambetto-promo-'));
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((r) => server.stdout.once('data', () => r()));

const PLAYER = { username: 'Giulia', password: 'promo-giulia-locale' };
const FRIEND = { username: 'Marco', password: 'promo-marco-locale' };
async function register(account: typeof PLAYER) {
  const res = await fetch(`${BASE}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account) });
  return res.headers.get('set-cookie')!.split(';')[0];
}
const playerCookie = await register(PLAYER);
const friendCookie = await register(FRIEND);

// ── Browser: la finestra ingrandita dal fattore di scala dà fotogrammi in Full HD ──
const browser = await chromium.launch({ args: [`--force-device-scale-factor=${VIEW.scale}`, `--window-size=${VIEW.w},${VIEW.h}`] });
const context = await browser.newContext({ viewport: null, bypassCSP: true, serviceWorkers: 'block', locale: 'it-IT' });

// Sovrimpressioni: cursore finto, didascalia in basso, cartello a tutto schermo.
await context.addInitScript(() => {
  const install = () => {
    const style = document.createElement('style');
    style.textContent = `
      /* Scacchiera un po' più piccola: in basso resta spazio per la didascalia. */
      @media (min-width: 941px) {
        :root { --board: min(calc(100vh - 322px), 720px) !important; }
        .page.lesson, .page.line-view { --board: min(calc(100vh - 212px), 760px) !important; }
      }
      @media (max-width: 700px) {
        #promo-caption { white-space: normal !important; width: max-content; max-width: calc(100vw - 36px); bottom: 30px !important; }
        #promo-card h1 { font-size: 92px !important; }
        #promo-card p { font-size: 30px !important; }
        #promo-card small { font-size: 12px !important; }
      }
      #promo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 100000; pointer-events: none; transition: transform .06s linear; filter: drop-shadow(0 3px 5px rgba(0,0,0,.6)); }
      #promo-cursor.down svg { transform: scale(.82); }
      #promo-cursor svg { transition: transform .08s; transform-origin: 4px 4px; }
      #promo-ring { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 2px solid #f7dca0; z-index: 99999; pointer-events: none; opacity: 0; }
      #promo-ring.go { animation: promo-ring .5s ease-out; }
      @keyframes promo-ring { from { opacity: .9; transform: scale(.3); } to { opacity: 0; transform: scale(1.3); } }
      #promo-caption { position: fixed; left: 50%; bottom: 14px; z-index: 99998; transform: translate(-50%, 30px); opacity: 0; pointer-events: none;
        padding: 9px 26px 11px; border-radius: 16px; text-align: center; white-space: nowrap;
        background: rgba(16, 13, 9, .9); border: 1px solid rgba(226, 183, 106, .55); box-shadow: 0 24px 60px rgba(0,0,0,.7), 0 0 60px -20px rgba(226,183,106,.5);
        transition: opacity .45s, transform .45s cubic-bezier(.22,1,.36,1); }
      #promo-caption.on { opacity: 1; transform: translate(-50%, 0); }
      #promo-caption small { display: block; font: 700 11px 'Manrope Variable', sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #e2b76a; margin-bottom: 3px; }
      #promo-caption span { font: 500 24px 'Fraunces Variable', serif; letter-spacing: -.01em; color: #f4ede1; }
      #promo-card { position: fixed; inset: 0; z-index: 99997; display: grid; place-items: center; text-align: center; pointer-events: none; opacity: 0; transition: opacity .6s;
        background: radial-gradient(700px 500px at 50% 40%, rgba(226,183,106,.22), transparent 70%), #0d0b09; }
      #promo-card.on { opacity: 1; }
      #promo-card svg { color: #e2b76a; }
      #promo-card h1 { font: 500 110px 'Fraunces Variable', serif; letter-spacing: -.03em; color: #f4ede1; margin: 6px 0 10px; }
      #promo-card p { font: italic 400 38px 'Fraunces Variable', serif; color: #f7dca0; margin: 0; }
      #promo-card small { display: block; margin-top: 26px; font: 700 15px 'Manrope Variable', sans-serif; letter-spacing: .24em; text-transform: uppercase; color: #a69c8c; }
      #promo-card > div { transform: translateY(14px); transition: transform 1.2s cubic-bezier(.22,1,.36,1); }
      #promo-card.on > div { transform: none; }
    `;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = 'promo-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 3l15 8.500-6.500 1.700L9.800 20 4 3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    ring.id = 'promo-ring';
    const caption = document.createElement('div');
    caption.id = 'promo-caption';
    const card = document.createElement('div');
    card.id = 'promo-card';
    document.body.append(card, caption, ring, cursor);
    const saved = JSON.parse(sessionStorage.getItem('promo-mouse') ?? `[${innerWidth / 2},${innerHeight * 0.55}]`);
    cursor.style.transform = `translate(${saved[0]}px, ${saved[1]}px)`;
    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      sessionStorage.setItem('promo-mouse', JSON.stringify([e.clientX, e.clientY]));
    }, true);
    window.addEventListener('mousedown', (e) => {
      cursor.classList.add('down');
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      ring.classList.remove('go');
      void ring.offsetWidth;
      ring.classList.add('go');
    }, true);
    window.addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  };
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install);
});

const page: Page = await context.newPage();
const cdp: CDPSession = await context.newCDPSession(page);

// ── Registrazione dei fotogrammi ──
interface Clip {
  name: string;
  duration: number;
  marks: Record<string, number>;
}
const clips: Clip[] = [];
let current: { dir: string; frames: { file: string; t: number }[]; start: number; marks: Record<string, number>; n: number } | null = null;

cdp.on('Page.screencastFrame', (frame) => {
  void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  if (!current) return;
  const file = `${String(++current.n).padStart(5, '0')}.jpg`;
  writeFileSync(join(current.dir, file), Buffer.from(frame.data, 'base64'));
  current.frames.push({ file, t: Date.now() });
});

// ONLY=06,07 registra soltanto le scene indicate, lasciando intatte le altre già fatte.
const only = process.env.ONLY?.split(',');

async function clip(name: string, scene: () => Promise<void>) {
  if (only && !only.some((p) => name.startsWith(p))) return;
  const dir = join(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  current = { dir, frames: [], start: Date.now(), marks: {}, n: 0 };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
  // Un piccolo cambiamento forza subito il primo fotogramma.
  await page.evaluate(() => document.body.style.setProperty('--promo', String(Math.random())));
  await sleep(120);
  await scene();
  await sleep(150);
  await cdp.send('Page.stopScreencast');
  const done = current;
  current = null;
  const end = Date.now();
  // Elenco per ffmpeg: ogni fotogramma resta a schermo fino al successivo.
  const lines = ['ffconcat version 1.0'];
  done.frames.forEach((f, i) => {
    const next = done.frames[i + 1]?.t ?? end;
    lines.push(`file '${name}/${f.file}'`, `duration ${Math.max(0.001, (next - f.t) / 1000).toFixed(3)}`);
  });
  if (done.frames.length) lines.push(`file '${name}/${done.frames.at(-1)!.file}'`);
  writeFileSync(join(FRAMES, `${name}.txt`), lines.join('\n') + '\n');
  const first = done.frames[0]?.t ?? done.start;
  const marks = Object.fromEntries(Object.entries(done.marks).map(([k, v]) => [k, (v - first) / 1000]));
  clips.push({ name, duration: (end - first) / 1000, marks });
  console.log(`  ${name}: ${done.frames.length} fotogrammi, ${((end - first) / 1000).toFixed(1)} s`);
}
const mark = (name: string) => {
  if (current) current.marks[name] = Date.now();
};

// ── Gesti ──
const CENTER = { x: VIEW.w / 2, y: VIEW.h * 0.55 };
let mouse = { ...CENTER };
async function glide(x: number, y: number, ms = 520) {
  const steps = Math.max(6, Math.round(ms / 22));
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(18);
  }
  mouse = { x, y };
}
async function press() {
  await sleep(110);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}
async function click(selector: string | ReturnType<Page['locator']>, ms = 520) {
  const loc = typeof selector === 'string' ? page.locator(selector).first() : selector.first();
  await reveal(loc);
  const box = (await loc.boundingBox())!;
  await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
  await press();
}
/** Porta dolcemente un elemento al centro dello schermo, se è fuori vista o coperto da barra e didascalia. */
async function reveal(loc: ReturnType<Page['locator']>) {
  const scrolled = await loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top >= 70 && r.bottom <= innerHeight - 96) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  });
  if (scrolled) await sleep(650);
}
const showBoard = () => reveal(page.locator('cg-board'));
const button = (name: string | RegExp) => page.getByRole('button', { name });

async function square(sq: string, orientation: 'white' | 'black' = 'white') {
  const box = (await page.locator('cg-board').boundingBox())!;
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]) - 1;
  const col = orientation === 'white' ? f : 7 - f;
  const row = orientation === 'white' ? 7 - r : r;
  return { x: box.x + ((col + 0.5) * box.width) / 8, y: box.y + ((row + 0.5) * box.height) / 8 };
}
async function move(from: string, to: string, speed = 360) {
  await showBoard();
  const a = await square(from);
  await glide(a.x, a.y, speed);
  await press();
  const b = await square(to);
  await glide(b.x, b.y, speed);
  await press();
  await sleep(320);
}
const caption = (title: string, eyebrow = '') =>
  page.evaluate(
    ([t, e]) => {
      const el = document.getElementById('promo-caption')!;
      el.innerHTML = t ? `${e ? `<small>${e}</small>` : ''}<span>${t}</span>` : el.innerHTML;
      el.classList.toggle('on', !!t);
    },
    [title, eyebrow],
  );
const card = (html: string | null) =>
  page.evaluate((h) => {
    const el = document.getElementById('promo-card')!;
    if (h) el.innerHTML = h;
    el.classList.toggle('on', !!h);
  }, html);
const LOGO =
  '<svg viewBox="0 0 32 32" width="120" height="120"><path d="M9 27h14l-1.200-4H10.200L9 27Zm2-6h10c0-5-2-6.500-2-10.500 2-.700 3.300-2.600 3.300-4.700l-2.700 1.400L17.800 4 16 6.600 14.200 4l-1.800 3.200-2.700-1.400c0 2.100 1.300 4 3.300 4.700 0 4-2 5.500-2 10.500Z" fill="currentColor"/></svg>';
const go = async (hash: string) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await sleep(700);
};
const myTurn = async () => {
  await sleep(350);
  await page.waitForFunction(() => document.querySelector('.status-line')?.textContent?.includes('Tocca a te'), undefined, { timeout: 20000 });
  await sleep(450);
};

// ── Scene ──
console.log('Registrazione delle scene…');
await page.goto(`${BASE}/`);
await page.waitForSelector('cg-board piece');
await page.evaluate(() => document.fonts.ready);
await page.mouse.move(mouse.x, mouse.y);
// Il cartello d'apertura deve essere già visibile al primo fotogramma.
await card(`<div>${LOGO}<h1>Gambetto</h1><p>Scacchi, con stile.</p></div>`);
await sleep(900);

await clip('01-intro', async () => {
  await sleep(2300);
  mark('reveal');
  await card(null);
  await sleep(900);
  await caption('Gioca, impara, stupisci.', 'Gambetto');
  await sleep(3200);
  await click('a.btn.primary.xl');
  await sleep(500);
});

await clip('02-computer', async () => {
  await caption('Otto livelli, dal principiante al Gran Maestro', 'Sfida il computer');
  await sleep(900);
  await click(page.locator('.level-card').nth(6), 700);
  await sleep(500);
  await click(page.locator('.level-card').nth(4), 500);
  await sleep(700);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 30);
    await sleep(34);
  }
  await sleep(300);
  await click(button('Inizia la partita'));
  await page.waitForSelector('.game-layout cg-board piece');
  await sleep(1100);
  mark('moves');
  await move('e2', 'e4');
  await myTurn();
  await move('g1', 'f3');
  await myTurn();
  await move('f1', 'c4');
  await myTurn();
  mark('hint');
  await caption('Un suggerimento, quando serve', 'Sfida il computer');
  await click(button(/Suggerimento/));
  await showBoard();
  await page.waitForSelector('.cg-shapes g line, .cg-shapes line', { timeout: 15000 }).catch(() => undefined);
  await sleep(1800);
  await click(page.locator('.side-panel .toggle', { hasText: 'Barra di valutazione' }).locator('span').first());
  await sleep(2200);
});

await clip('03-analisi', async () => {
  await caption('Due giocatori, una sola scacchiera', 'Dal vivo');
  await go('/gioca?go=1&mode=local&promo=1');
  await page.waitForSelector('.game-layout cg-board piece');
  await sleep(700);
  // Matto del barbiere.
  for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['h5', 'f7']]) await move(a, b, 250);
  mark('mate');
  await page.waitForSelector('.modal.result');
  await sleep(1700);
  await caption('Dove hai sbagliato? Te lo dice il motore', 'Analisi a fine partita');
  await click(page.locator('.modal').getByRole('button', { name: /Analizza/ }));
  await page.waitForSelector('.review-summary', { timeout: 60000 });
  if (VERTICAL) await reveal(page.locator('.review-summary'));
  mark('review');
  await sleep(1800);
  await page.keyboard.press('ArrowLeft');
  await sleep(1300);
  mark('best');
  await click(button(/Mostra/));
  await showBoard();
  await sleep(2600);
});

await clip('04-lezioni', async () => {
  await caption('26 lezioni interattive, dalle regole ai finali', 'Impara');
  await go('/impara');
  await sleep(1100);
  await glide(CENTER.x, CENTER.y, 400);
  for (let i = 0; i < 26; i++) {
    await page.mouse.wheel(0, 34);
    await sleep(34);
  }
  await sleep(1100);
  await go('/impara/intermedio/forchetta');
  await page.waitForSelector('cg-board piece');
  await caption('Leggi, guarda, poi prova tu', 'Impara');
  await sleep(2000);
  await click(button(/Avanti/));
  await sleep(1300);
  mark('exercise');
  await move('d5', 'c7', 420);
  await sleep(1100);
  await move('c7', 'a8', 420);
  await sleep(2200);
});

await clip('05-aperture', async () => {
  await caption('Aperture famose e trappole da ricordare', 'Repertorio');
  await go('/aperture');
  await sleep(1300);
  await click('a[href*="tab=chicche"]');
  await sleep(1600);
  await click('a.line-card[href$="aperture/legal"]');
  await page.waitForSelector('cg-board piece');
  await caption('Il matto di Legal: la Donna in regalo', 'Trappole celebri');
  await sleep(1200);
  mark('line');
  for (let i = 0; i < 13; i++) {
    await page.keyboard.press('ArrowRight');
    await sleep(i > 8 ? 700 : 430);
  }
  mark('mate');
  await sleep(1900);
});

// Per la scena online il visitatore diventa Giulia; Marco è guidato da qui.
const [cookieName, cookieValue] = playerCookie.split('=');
await context.addCookies([{ name: cookieName, value: cookieValue, url: BASE }]);
await page.goto(`${BASE}/#/online`);
await page.reload();
await page.waitForSelector('.user-chip');
await page.mouse.move(mouse.x, mouse.y);
await sleep(600);

let friend: WebSocket | null = null;
await clip('06-online', async () => {
  await caption('Mandi un link e si gioca, ognuno dal suo dispositivo', 'Online con gli amici');
  await sleep(1300);
  await click(button('Bianco'));
  await sleep(400);
  await click(button(/Crea la partita/));
  await page.waitForSelector('.invite-link');
  await sleep(1900);
  const gameId = (await page.evaluate(() => location.hash)).split('/').pop()!;
  const replies = ['e7e5', 'b8c6', 'g8f6'];
  friend = new WebSocket(`ws://localhost:${PORT}/ws?game=${gameId}`, { headers: { Cookie: friendCookie } });
  friend.on('message', (data) => {
    const msg = JSON.parse(String(data));
    if (msg.t !== 'state' || msg.status !== 'active' || msg.moves.length % 2 === 0) return;
    const reply = replies[(msg.moves.length - 1) / 2];
    if (reply) setTimeout(() => friend!.send(JSON.stringify({ t: 'move', from: reply.slice(0, 2), to: reply.slice(2) })), 750);
  });
  await page.waitForSelector('.game-layout cg-board piece');
  mark('start');
  await sleep(1400);
  await move('e2', 'e4');
  await myTurn();
  await move('g1', 'f3');
  await myTurn();
  await move('f1', 'c4');
  await myTurn();
});

await clip('07-temi', async () => {
  await caption('Cinque scacchiere, a tuo gusto', 'Personalizza');
  await click('.settings .icon-btn');
  await sleep(700);
  mark('themes');
  for (const i of [1, 2, 3, 4, 0]) {
    await click(page.locator('.swatch').nth(i), 300);
    await sleep(780);
  }
  await sleep(500);
});

await clip('08-finale', async () => {
  await caption('');
  await card(`<div>${LOGO}<h1>Gambetto</h1><p>Gratis. Senza pubblicità.</p><small>Gioca · Impara · Sfida gli amici</small></div>`);
  await sleep(3600);
});

const clipsFile = join(FRAMES, 'clips.json');
const previous: Clip[] = only && existsSync(clipsFile) ? JSON.parse(readFileSync(clipsFile, 'utf8')) : [];
const merged = [...previous.filter((p) => !clips.some((c) => c.name === p.name)), ...clips].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(clipsFile, JSON.stringify(merged, null, 2));
(friend as WebSocket | null)?.close();
await browser.close();
server.kill();
await sleep(300);
try {
  rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* su Windows il file può restare bloccato per un attimo */
}
console.log('Fatto. Ora: node scripts/promo/compose.ts');
process.exit(0);
