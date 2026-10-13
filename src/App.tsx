import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/ui.tsx';
import { useAccount } from './lib/account.ts';
import { href, useRoute } from './lib/router.ts';
import { setSetting, useStore, type Appearance, type Board3d, type BoardTheme, type Pieces3d } from './lib/store.ts';
import { Account } from './pages/Account.tsx';
import { Admin } from './pages/Admin.tsx';
import { Home } from './pages/Home.tsx';
import { Learn } from './pages/Learn.tsx';
import { Online } from './pages/Online.tsx';
import { Openings } from './pages/Openings.tsx';
import { Play } from './pages/Play.tsx';
import { Privacy } from './pages/Privacy.tsx';
import { Puzzles } from './pages/Puzzles.tsx';

const THEMES: { id: BoardTheme; name: string }[] = [
  { id: 'noce', name: 'Noce' },
  { id: 'sabbia', name: 'Sabbia' },
  { id: 'torneo', name: 'Torneo' },
  { id: 'smeraldo', name: 'Smeraldo' },
  { id: 'ghiaccio', name: 'Ghiaccio' },
  { id: 'ardesia', name: 'Ardesia' },
  { id: 'notte', name: 'Notte' },
  { id: 'ametista', name: 'Ametista' },
  { id: 'rosa', name: 'Rosa' },
  { id: 'carbone', name: 'Carbone' },
];

const BOARDS_3D: { id: Board3d; name: string }[] = [
  { id: 'legno-chiaro', name: 'Legno chiaro' },
  { id: 'palissandro', name: 'Palissandro' },
  { id: 'legno-scuro', name: 'Legno scuro' },
  { id: 'legno-vetro', name: 'Legno e vetro' },
  { id: 'giada', name: 'Giada' },
  { id: 'marmo', name: 'Marmo' },
  { id: 'vetro-verde', name: 'Vetro verde' },
  { id: 'vetro', name: 'Vetro' },
  { id: 'blu', name: 'Blu classico' },
  { id: 'blu-lucido', name: 'Blu lucido' },
  { id: 'verde-lucido', name: 'Verde lucido' },
  { id: 'grigio-lucido', name: 'Grigio lucido' },
  { id: 'scarlatto', name: 'Scarlatto' },
  { id: 'giallo', name: 'Giallo' },
  { id: 'viola', name: 'Viola e nero' },
  { id: 'cera', name: 'Cera' },
  { id: 'oro-argento', name: 'Oro e argento' },
  { id: 'alluminio', name: 'Alluminio' },
  { id: 'bianco-nero', name: 'Bianco e nero' },
  { id: 'verniciato', name: 'Verniciato' },
];

const APPEARANCES: { id: Appearance; name: string }[] = [
  { id: 'dark', name: 'Scuro' },
  { id: 'light', name: 'Chiaro' },
  { id: 'auto', name: 'Automatico' },
];

const PIECES_3D: { id: Pieces3d; name: string }[] = [
  { id: 'classico', name: 'Classico' },
  { id: 'legno-chiaro', name: 'Legno' },
  { id: 'legno', name: 'Legno moderno' },
  { id: 'metallo', name: 'Metallo' },
  { id: 'vetro', name: 'Vetro' },
  { id: 'giada', name: 'Giada' },
  { id: 'essenziale', name: 'Essenziale' },
  { id: 'rifinito', name: 'Rifinito' },
  { id: 'rossoblu', name: 'Rosso e blu' },
  { id: 'sperimentale', name: 'Sperimentale' },
];

const NAV = [
  { path: 'gioca', label: 'Gioca' },
  { path: 'online', label: 'Online' },
  { path: 'impara', label: 'Impara' },
  { path: 'problemi', label: 'Problemi' },
  { path: 'aperture', label: 'Aperture' },
];

function Settings() {
  const { settings } = useStore();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (key: 'sound' | 'showDests' | 'coords' | 'evalBar', label: string) => (
    <label className="toggle">
      <input type="checkbox" checked={settings[key]} onChange={(e) => setSetting(key, e.target.checked)} />
      <span /> {label}
    </label>
  );

  return (
    <div className="settings" ref={box}>
      <button className={`icon-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-label="Impostazioni" title="Impostazioni">
        <Icon name="gear" />
      </button>
      {open && (
        <div className="popover">
          <span className="eyebrow">Aspetto</span>
          <div className="segmented">
            {APPEARANCES.map((a) => (
              <button key={a.id} className={settings.appearance === a.id ? 'on' : ''} onClick={() => setSetting('appearance', a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          <span className="eyebrow">Scacchiera</span>
          <div className="segmented">
            <button className={settings.board3d ? '' : 'on'} onClick={() => setSetting('board3d', false)}>
              2D
            </button>
            <button className={settings.board3d ? 'on' : ''} onClick={() => setSetting('board3d', true)}>
              3D
            </button>
          </div>
          {!settings.board3d && (
            <div className="swatches">
              {THEMES.map((t) => (
                <button key={t.id} className={`swatch theme-${t.id} ${settings.boardTheme === t.id ? 'on' : ''}`} onClick={() => setSetting('boardTheme', t.id)} title={t.name}>
                  <i />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          )}
          {settings.board3d && (
            <>
              <div className="swatches">
                {BOARDS_3D.map((b) => (
                  <button key={b.id} className={`swatch ${settings.board3dStyle === b.id ? 'on' : ''}`} onClick={() => setSetting('board3dStyle', b.id)} title={b.name}>
                    <i className={`thumb-board3d b3d-${b.id}`} />
                    <span>{b.name}</span>
                  </button>
                ))}
              </div>
              <span className="eyebrow">Pezzi 3D</span>
              <div className="swatches">
                {PIECES_3D.map((p) => (
                  <button key={p.id} className={`swatch ${settings.pieces3d === p.id ? 'on' : ''}`} onClick={() => setSetting('pieces3d', p.id)} title={p.name}>
                    <i className={`thumb3d set-${p.id}`} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <span className="eyebrow">Preferenze</span>
          {toggle('sound', 'Suoni')}
          {toggle('showDests', 'Mostra le mosse possibili')}
          {toggle('coords', 'Coordinate')}
          {toggle('evalBar', 'Barra di valutazione')}
        </div>
      )}
    </div>
  );
}

export function App() {
  const route = useRoute();
  const section = route.path[0] ?? '';
  const { user, ready, config } = useAccount();
  const PAGES: Record<string, React.ReactNode> = {
    gioca: <Play />,
    impara: <Learn />,
    aperture: <Openings />,
    online: <Online />,
    account: <Account />,
    admin: <Admin />,
    privacy: <Privacy />,
    problemi: <Puzzles />,
  };
  const page = PAGES[section] ?? <Home />;
  // La chiave fa ripartire l'animazione d'ingresso a ogni cambio di sezione.
  const pageKey = section === 'gioca' ? `gioca?${route.query.toString()}` : route.path.slice(0, 1).join('/');

  const pathKey = route.path.join('/');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathKey]);

  return (
    <>
      <div className="backdrop" aria-hidden />
      <nav className="topbar">
        <a className="brand" href={href('')}>
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
            <path d="M9 27h14l-1.200-4H10.200L9 27Zm2-6h10c0-5-2-6.500-2-10.500 2-.700 3.300-2.600 3.300-4.700l-2.700 1.400L17.800 4 16 6.600 14.200 4l-1.800 3.200-2.700-1.400c0 2.100 1.300 4 3.300 4.700 0 4-2 5.500-2 10.500Z" fill="currentColor" />
          </svg>
          <span>Gambetto</span>
        </a>
        <div className="nav-links">
          {NAV.map((n) => (
            <a key={n.path} className={section === n.path ? 'on' : ''} href={href(n.path)}>
              {n.label}
            </a>
          ))}
        </div>
        {ready &&
          (user ? (
            <a className={`user-chip ${section === 'account' ? 'on' : ''}`} href={href('account')} title="Il tuo account">
              <i>{user.username[0].toUpperCase()}</i>
              <span>{user.username}</span>
            </a>
          ) : (
            <a className="btn small-nav" href={href('account')}>
              Accedi
            </a>
          ))}
        <Settings />
      </nav>
      {config.notice && <div className="site-notice">{config.notice}</div>}
      <main key={pageKey}>{page}</main>
      <footer className="foot">
        Gambetto · motore <a href="https://stockfishchess.org" target="_blank" rel="noreferrer">Stockfish</a>, scacchiera <a href="https://github.com/lichess-org/chessground" target="_blank" rel="noreferrer">Chessground</a> di Lichess · <a href={href('privacy')}>Privacy</a>
      </footer>
    </>
  );
}
