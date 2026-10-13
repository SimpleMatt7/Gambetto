import { useState, type FormEvent } from 'react';
import { Icon } from '../components/ui.tsx';
import { COURSES } from '../data/lessons.ts';
import { OPENINGS, TRICKS } from '../data/openings.ts';
import { api, deleteAccount, signIn, signOut, useAccount } from '../lib/account.ts';
import { href, navigate, useRoute } from '../lib/router.ts';
import { useStore } from '../lib/store.ts';

export function Account() {
  const { user, ready } = useAccount();
  if (!ready) return <div className="page center-note">Un momento…</div>;
  return user ? <Profile /> : <SignIn />;
}

function SignIn() {
  const { query } = useRoute();
  const { config } = useAccount();
  const [wanted, setMode] = useState<'login' | 'register'>(query.get('nuovo') ? 'register' : 'login');
  // A registrazioni chiuse resta solo l'accesso.
  const mode = config.registration ? wanted : 'login';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = query.get('next');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(mode, username.trim(), password);
      if (next) navigate(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth">
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">Account</span>
        <h1>{mode === 'login' ? 'Bentornato' : 'Crea il tuo account'}</h1>
        <p className="lead">
          {mode === 'login'
            ? 'Accedi per ritrovare i tuoi progressi e giocare online.'
            : 'Serve solo un nome utente e una password. I progressi fatti finora su questo dispositivo verranno salvati sul tuo account.'}
        </p>

        {config.registration ? (
          <div className="segmented">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
              Accedi
            </button>
            <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
              Registrati
            </button>
          </div>
        ) : (
          <div className="feedback hint">Le nuove registrazioni sono chiuse: può accedere solo chi ha già un account.</div>
        )}

        <label className="field">
          <span>Nome utente</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} required autoFocus />
          {mode === 'register' && <small>Da 3 a 20 caratteri: lettere, numeri, trattino. Sarà visibile agli avversari.</small>}
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
          {mode === 'register' && <small>Almeno 8 caratteri. Non c'è recupero via email: se la dimentichi, potrà reimpostarla solo l'amministratore.</small>}
        </label>

        {error && <div className="feedback bad">{error}</div>}

        <button className="btn primary xl" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Accedi' : 'Crea account'} <Icon name="arrow" />
        </button>
        <p className="auth-foot">
          Per giocare da soli, in due sullo stesso schermo e per le lezioni non serve nessun account. <a href={href('privacy')}>Cosa viene salvato</a>
        </p>
      </form>
    </div>
  );
}

function Profile() {
  const { user } = useAccount();
  const { lessons, lines, stats } = useStore();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  if (!user) return null;

  const removeAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm('Eliminare definitivamente il tuo account e tutti i progressi? Non si può annullare.')) return;
    try {
      await deleteAccount(confirm);
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  const totalLessons = COURSES.reduce((n, c) => n + c.lessons.length, 0);
  const totals = Object.values(stats).reduce((t, s) => ({ w: t.w + s.w, l: t.l + s.l, d: t.d + s.d }), { w: 0, l: 0, d: 0 });

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('PUT', '/api/password', { current, password });
      setNote({ ok: true, text: 'Password aggiornata.' });
      setCurrent('');
      setPassword('');
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <div className="page profile">
      <header className="page-head">
        <span className="eyebrow">Il tuo account</span>
        <h1>
          {user.username} {user.role === 'admin' && <span className="chip">Admin</span>}
        </h1>
        <p className="lead">I progressi si salvano da soli sul tuo account e ti seguono su ogni dispositivo.</p>
      </header>

      <dl className="stat-cards">
        <div>
          <dt>
            {lessons.length}
            <small>/{totalLessons}</small>
          </dt>
          <dd>lezioni completate</dd>
        </div>
        <div>
          <dt>
            {lines.length}
            <small>/{OPENINGS.length + TRICKS.length}</small>
          </dt>
          <dd>aperture e trappole allenate</dd>
        </div>
        <div>
          <dt>{totals.w}</dt>
          <dd>
            vittorie contro il computer · {totals.d} patte · {totals.l} sconfitte
          </dd>
        </div>
      </dl>

      <div className="profile-actions">
        <a className="btn primary" href={href('online')}>
          <Icon name="users" /> Gioca online
        </a>
        {user.role === 'admin' && (
          <a className="btn" href={href('admin')}>
            <Icon name="gear" /> Pannello admin
          </a>
        )}
        <button className="btn ghost" onClick={() => void signOut()}>
          Esci
        </button>
      </div>

      <form className="auth-card slim" onSubmit={changePassword}>
        <h2>Cambia password</h2>
        <label className="field">
          <span>Password attuale</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>Nuova password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        {note && <div className={`feedback ${note.ok ? 'good' : 'bad'}`}>{note.text}</div>}
        <button className="btn">Aggiorna password</button>
      </form>

      <form className="auth-card slim danger-zone" onSubmit={removeAccount}>
        <h2>Elimina account</h2>
        <p className="muted">
          Nome utente, password e progressi vengono cancellati subito e per sempre. Le partite online in corso vengono assegnate all'avversario. <a href={href('privacy')}>Maggiori dettagli</a>
        </p>
        <label className="field">
          <span>Conferma con la tua password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="current-password" required />
        </label>
        {deleteError && <div className="feedback bad">{deleteError}</div>}
        <button className="btn ghost danger">Elimina il mio account</button>
      </form>
    </div>
  );
}
