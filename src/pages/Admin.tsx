import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/ui.tsx';
import { api, setSiteConfig, useAccount } from '../lib/account.ts';
import { href, useRoute } from '../lib/router.ts';
import { timeLabel } from './Online.tsx';

interface AdminUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
  disabled: number;
  created_at: number;
  last_seen: number;
  progress: string;
  games: number;
}

interface AdminGame {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  result: 'white' | 'black' | 'draw' | null;
  reason: string | null;
  white: string | null;
  black: string | null;
  plies: number;
  time_base: number;
  time_inc: number;
  updated_at: number;
}

interface SiteSettings {
  registration: boolean;
  online: boolean;
  spectators: boolean;
  notice: string;
  contact: string;
}

interface Overview {
  users: AdminUser[];
  games: AdminGame[];
  settings: SiteSettings;
}

const when = (ts: number) => new Date(ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const STATUS = { waiting: 'In attesa', active: 'In corso', finished: 'Conclusa' };
const TABS = [
  ['utenti', 'Utenti'],
  ['partite', 'Partite'],
  ['impostazioni', 'Impostazioni'],
] as const;

export function Admin() {
  const { user, ready } = useAccount();
  const { query } = useRoute();
  const tab = TABS.find(([id]) => id === query.get('tab'))?.[0] ?? 'utenti';
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    api<Overview>('GET', '/api/admin/overview')
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  /** Esegue un'azione, mostra l'eventuale errore e ricarica i dati. */
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!ready) return <div className="page center-note">Un momento…</div>;
  if (user?.role !== 'admin') {
    return (
      <div className="page setup">
        <div className="gate">
          <Icon name="lock" size={26} />
          <h2>Area riservata</h2>
          <p>Questa pagina è accessibile solo agli amministratori.</p>
          <a className="btn primary" href={href(user ? '' : 'account', user ? undefined : { next: 'admin' })}>
            {user ? 'Torna alla home' : 'Accedi'}
          </a>
        </div>
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const users = data?.users.filter((u) => u.username.toLowerCase().includes(q)) ?? [];
  const games = data?.games.filter((g) => `${g.id} ${g.white} ${g.black}`.toLowerCase().includes(q)) ?? [];

  return (
    <div className="page admin">
      <header className="page-head">
        <span className="eyebrow">Amministrazione</span>
        <h1>Pannello admin</h1>
      </header>

      {data && (
        <dl className="stat-cards">
          <div>
            <dt>{data.users.length}</dt>
            <dd>utenti registrati</dd>
          </div>
          <div>
            <dt>{data.games.filter((g) => g.status === 'active').length}</dt>
            <dd>partite in corso</dd>
          </div>
          <div>
            <dt>{data.games.length}</dt>
            <dd>partite online recenti</dd>
          </div>
        </dl>
      )}

      <div className="admin-bar">
        <div className="segmented">
          {TABS.map(([id, label]) => (
            <a key={id} className={tab === id ? 'on' : ''} href={href('admin', { tab: id })}>
              {label}
            </a>
          ))}
        </div>
        {tab !== 'impostazioni' && <input className="search" placeholder="Cerca…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      </div>

      {error && <div className="feedback bad">{error}</div>}
      {!data && !error && <p className="center-note">Caricamento…</p>}

      {data && tab === 'utenti' && <Users users={users} selfId={user.id} act={act} />}
      {data && tab === 'partite' && <Games games={games} act={act} />}
      {data && tab === 'impostazioni' && <SettingsForm initial={data.settings} act={act} />}
    </div>
  );
}

type Act = (fn: () => Promise<unknown>) => Promise<void>;

function Users({ users, selfId, act }: { users: AdminUser[]; selfId: number; act: Act }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState<{ user: AdminUser; field: 'password' | 'username'; value: string } | null>(null);

  const create = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await api('POST', '/api/admin/users', { username: username.trim(), password });
      setUsername('');
      setPassword('');
    });
  };
  const patch = (id: number, body: object) => act(() => api('PATCH', `/api/admin/users/${id}`, body));
  const lessons = (u: AdminUser) => {
    try {
      return (JSON.parse(u.progress).lessons ?? []).length;
    } catch {
      return 0;
    }
  };

  return (
    <>
      <form className="admin-create" onSubmit={create}>
        <strong>Nuovo utente</strong>
        <input placeholder="Nome utente" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" maxLength={20} required />
        <input placeholder="Password (min. 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        <button className="btn">
          <Icon name="plus" /> Crea
        </button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Utente</th>
              <th>Ruolo</th>
              <th>Lezioni</th>
              <th>Partite</th>
              <th>Registrato</th>
              <th>Ultimo accesso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.disabled ? 'off' : ''}>
                <td>
                  <strong>{u.username}</strong>
                  {u.id === selfId && <span className="chip">Tu</span>}
                  {!!u.disabled && <span className="chip bad">Disattivato</span>}
                </td>
                <td>{u.role === 'admin' ? <span className="chip">Admin</span> : 'Utente'}</td>
                <td>{lessons(u)}</td>
                <td>{u.games}</td>
                <td>{when(u.created_at)}</td>
                <td>{when(u.last_seen)}</td>
                <td className="row-actions">
                  <button onClick={() => setEditing({ user: u, field: 'username', value: u.username })}>Rinomina</button>
                  <button onClick={() => setEditing({ user: u, field: 'password', value: '' })}>Password</button>
                  {u.id !== selfId && (
                    <>
                      <button onClick={() => patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}>{u.role === 'admin' ? 'Togli admin' : 'Rendi admin'}</button>
                      <button onClick={() => patch(u.id, { disabled: !u.disabled })}>{u.disabled ? 'Riattiva' : 'Disattiva'}</button>
                      <button
                        className="danger"
                        onClick={() => window.confirm(`Eliminare definitivamente l'utente ${u.username}? I suoi progressi andranno persi.`) && act(() => api('DELETE', `/api/admin/users/${u.id}`))}
                      >
                        Elimina
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Nessun utente trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-veil" onClick={() => setEditing(null)}>
          <form
            className="modal form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void patch(editing.user.id, { [editing.field]: editing.value });
              setEditing(null);
            }}
          >
            <h2>{editing.field === 'password' ? 'Nuova password' : 'Rinomina utente'}</h2>
            <p>
              {editing.field === 'password'
                ? `Imposta una nuova password per ${editing.user.username}. Verrà disconnesso da tutti i dispositivi.`
                : `Nuovo nome utente per ${editing.user.username}.`}
            </p>
            <label className="field">
              <input
                type={editing.field === 'password' ? 'password' : 'text'}
                value={editing.value}
                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                autoComplete={editing.field === 'password' ? 'new-password' : 'off'}
                minLength={editing.field === 'password' ? 8 : 3}
                maxLength={editing.field === 'password' ? 200 : 20}
                required
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button className="btn primary">Salva</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Games({ games, act }: { games: AdminGame[]; act: Act }) {
  const result = (g: AdminGame) => (g.status !== 'finished' ? '—' : `${g.result === 'draw' ? 'Patta' : g.result === 'white' ? 'Vince il Bianco' : 'Vince il Nero'} · ${g.reason}`);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Codice</th>
            <th>Bianco</th>
            <th>Nero</th>
            <th>Stato</th>
            <th>Esito</th>
            <th>Mosse</th>
            <th>Tempo</th>
            <th>Aggiornata</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id}>
              <td>
                <code>{g.id}</code>
              </td>
              <td>{g.white ?? '—'}</td>
              <td>{g.black ?? '—'}</td>
              <td>
                <span className={`chip ${g.status === 'active' ? 'live' : g.status === 'finished' ? 'muted' : ''}`}>{STATUS[g.status]}</span>
              </td>
              <td>{result(g)}</td>
              <td>{Math.ceil(g.plies / 2)}</td>
              <td>{timeLabel(g.time_base, g.time_inc)}</td>
              <td>{when(g.updated_at)}</td>
              <td className="row-actions">
                <a href={href(`online/${g.id}`)}>Apri</a>
                {g.status !== 'finished' && (
                  <button onClick={() => window.confirm('Chiudere questa partita come patta?') && act(() => api('PATCH', `/api/admin/games/${g.id}`, {}))}>Chiudi</button>
                )}
                <button className="danger" onClick={() => window.confirm('Eliminare definitivamente questa partita?') && act(() => api('DELETE', `/api/admin/games/${g.id}`))}>
                  Elimina
                </button>
              </td>
            </tr>
          ))}
          {games.length === 0 && (
            <tr>
              <td colSpan={9} className="empty">
                Nessuna partita trovata.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SettingsForm({ initial, act }: { initial: SiteSettings; act: Act }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const r = await api<{ settings: SiteSettings }>('PUT', '/api/admin/settings', s);
      setS(r.settings);
      setSiteConfig(r.settings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });
  };

  const toggle = (key: 'registration' | 'online' | 'spectators', title: string, text: string) => (
    <label className="setting">
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <span className="toggle">
        <input type="checkbox" checked={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.checked })} />
        <span />
      </span>
    </label>
  );

  return (
    <form className="settings-form" onSubmit={save}>
      {toggle('registration', 'Registrazioni aperte', 'Se disattivi, nessuno può creare un nuovo account da solo: puoi sempre crearli tu dalla scheda Utenti.')}
      {toggle('online', 'Partite online', 'Se disattivi, non si possono creare nuove partite online. Quelle in corso proseguono.')}
      {toggle('spectators', 'Spettatori', 'Chi ha il link di una partita può guardarla anche senza giocarla.')}
      <label className="setting column">
        <span>
          <strong>Avviso sul sito</strong>
          <small>Un messaggio mostrato in cima a tutte le pagine, ad esempio per annunciare una manutenzione. Lascia vuoto per nasconderlo.</small>
        </span>
        <textarea value={s.notice} onChange={(e) => setS({ ...s, notice: e.target.value })} maxLength={300} rows={2} placeholder="Nessun avviso" />
      </label>
      <label className="setting column">
        <span>
          <strong>Contatto del gestore</strong>
          <small>Un recapito (email o altro) mostrato nella pagina sulla privacy, per chi vuole chiedere qualcosa sui propri dati. Facoltativo.</small>
        </span>
        <input value={s.contact} onChange={(e) => setS({ ...s, contact: e.target.value })} maxLength={120} placeholder="Nessun contatto" />
      </label>
      <button className="btn primary" disabled={!dirty}>
        <Icon name="check" /> {saved ? 'Salvato' : 'Salva le impostazioni'}
      </button>
    </form>
  );
}
