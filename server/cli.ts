// Strumenti di emergenza da riga di comando, per quando non si riesce a entrare nel pannello admin.
//   node server/cli.ts list
//   node server/cli.ts passwd <utente> <nuova-password>
//   node server/cli.ts admin <utente>
import { checkPassword, hashPassword } from './auth.ts';
import { all, run, type UserRow } from './db.ts';

const [command, username, value] = process.argv.slice(2);

if (command === 'list') {
  for (const u of all<UserRow>('SELECT * FROM users ORDER BY id')) {
    console.log(`${String(u.id).padStart(4)}  ${u.username.padEnd(20)}  ${u.role}${u.disabled ? '  (disattivato)' : ''}`);
  }
} else if (command === 'passwd' && username && value) {
  const { changes } = run('UPDATE users SET pass = ? WHERE username = ?', hashPassword(checkPassword(value)), username);
  if (changes) run('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)', username);
  console.log(changes ? `Password di ${username} aggiornata.` : 'Utente non trovato.');
} else if (command === 'admin' && username) {
  const { changes } = run("UPDATE users SET role = 'admin', disabled = 0 WHERE username = ?", username);
  console.log(changes ? `${username} ora è amministratore.` : 'Utente non trovato.');
} else {
  console.log('Uso: node server/cli.ts list | passwd <utente> <password> | admin <utente>');
}
process.exit(0);
