// Strumenti da riga di comando, per creare l'amministratore al primo avvio e per le emergenze.
//   node server/cli.ts crea-admin <utente>      chiede la password senza mostrarla
//   node server/cli.ts list
//   node server/cli.ts passwd <utente>          chiede la nuova password senza mostrarla
//   node server/cli.ts admin <utente>           promuove un utente esistente
import { createInterface } from 'node:readline';
import { checkPassword, checkUsername, hashPassword } from './auth.ts';
import { all, one, run, type UserRow } from './db.ts';

/** Chiede una riga da tastiera. Con `hidden` i caratteri digitati non compaiono a schermo. */
function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (hidden && process.stdin.isTTY) {
      // readline riscrive la riga a ogni tasto: si lascia passare solo la domanda.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden && process.stdin.isTTY) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

// Quando l'ingresso non è una tastiera (per esempio in uno script) le righe arrivano tutte insieme:
// si leggono una volta sola e si consumano in ordine.
let piped: string[] | null = null;
async function line(question: string, hidden = false): Promise<string> {
  if (process.stdin.isTTY) return ask(question, hidden);
  if (!piped) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    piped = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  }
  return piped.shift() ?? '';
}

async function newPassword(): Promise<string> {
  const first = await line('Password (almeno 8 caratteri): ', true);
  const second = await line('Ripeti la password: ', true);
  if (first !== second) throw new Error('Le due password non coincidono.');
  return checkPassword(first);
}

const [command, username] = process.argv.slice(2);

try {
  if (command === 'crea-admin' && username) {
    const name = checkUsername(username);
    if (one('SELECT 1 FROM users WHERE username = ?', name)) throw new Error(`L'utente ${name} esiste già: usa "admin ${name}" per promuoverlo o "passwd ${name}" per cambiargli la password.`);
    const password = await newPassword();
    const now = Date.now();
    run("INSERT INTO users (username, pass, role, created_at, last_seen) VALUES (?, ?, 'admin', ?, ?)", name, hashPassword(password), now, now);
    console.log(`Amministratore ${name} creato. Ora puoi accedere dal sito.`);
  } else if (command === 'list') {
    for (const u of all<UserRow>('SELECT * FROM users ORDER BY id')) {
      console.log(`${String(u.id).padStart(4)}  ${u.username.padEnd(20)}  ${u.role}${u.disabled ? '  (disattivato)' : ''}`);
    }
  } else if (command === 'passwd' && username) {
    if (!one('SELECT 1 FROM users WHERE username = ?', username)) throw new Error('Utente non trovato.');
    const password = await newPassword();
    run('UPDATE users SET pass = ? WHERE username = ?', hashPassword(password), username);
    run('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)', username);
    console.log(`Password di ${username} aggiornata.`);
  } else if (command === 'admin' && username) {
    const { changes } = run("UPDATE users SET role = 'admin', disabled = 0 WHERE username = ?", username);
    console.log(changes ? `${username} ora è amministratore.` : 'Utente non trovato.');
  } else {
    console.log('Uso: node server/cli.ts crea-admin <utente> | list | passwd <utente> | admin <utente>');
  }
  process.exit(0);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
