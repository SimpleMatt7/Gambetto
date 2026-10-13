// Avversario di prova per le partite online in locale: entra in una partita e risponde con mosse a caso.
//   node scripts/dev-bot.ts <codice-partita> [http://localhost:8787]
// Serve solo per sviluppo: usa l'account di prova definito in dev-accounts.ts.
import { Chess } from 'chess.js';
import { WebSocket } from 'ws';
import { DEV_ACCOUNTS } from './dev-accounts.ts';


const [gameId, base = 'http://localhost:8787'] = process.argv.slice(2);
if (!gameId) {
  console.log('Uso: node scripts/dev-bot.ts <codice-partita> [indirizzo-server]');
  process.exit(1);
}

async function session(): Promise<string> {
  for (const path of ['/api/login', '/api/register']) {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEV_ACCOUNTS.bot) });
    if (res.ok) return res.headers.get('set-cookie')!.split(';')[0];
  }
  throw new Error('Impossibile accedere con l\'account del robot.');
}

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?game=${gameId}`, { headers: { Cookie: await session() } });
ws.on('message', (data) => {
  const msg = JSON.parse(String(data));
  if (msg.t === 'gone') {
    console.log('Partita non trovata.');
    process.exit(1);
  }
  if (msg.t !== 'state') return;
  if (msg.status === 'finished') {
    console.log(`Partita finita: ${msg.result} (${msg.reason})`);
    process.exit(0);
  }
  if (msg.drawOffer && msg.drawOffer !== msg.you) ws.send(JSON.stringify({ t: 'draw' }));
  const chess = new Chess();
  for (const san of msg.moves) chess.move(san);
  const turn = chess.turn() === 'w' ? 'white' : 'black';
  if (msg.status !== 'active' || turn !== msg.you) return;
  const moves = chess.moves({ verbose: true });
  const m = moves[Math.floor(Math.random() * moves.length)];
  setTimeout(() => ws.send(JSON.stringify({ t: 'move', from: m.from, to: m.to, promotion: m.promotion })), 700);
});
ws.on('open', () => console.log(`Robot collegato alla partita ${gameId}.`));
