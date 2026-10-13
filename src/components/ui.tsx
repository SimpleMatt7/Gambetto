import { Fragment, useEffect, useRef, type ReactNode } from 'react';

/** Testo con **grassetto** in stile markdown. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

const ICONS: Record<string, ReactNode> = {
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  flip: <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />,
  bulb: <path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3Z" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  first: <path d="m18 6-6 6 6 6M7 6v12" />,
  prev: <path d="m15 6-6 6 6 6" />,
  next: <path d="m9 6 6 6-6 6" />,
  last: <path d="m6 6 6 6-6 6M17 6v12" />,
  play: <path d="M7 5v14l12-7L7 5Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.900 4.900 7 7m10 10 2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  back: <path d="M19 12H5m5 5-5-5 5-5" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.500" />
      <path d="M2.500 20a6.500 6.500 0 0 1 13 0M16 4.800a3.500 3.500 0 0 1 0 6.400M18 14.500a6.500 6.500 0 0 1 3.500 5.500" />
    </>
  ),
  book: <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5Zm0 16h16M9 7h7" />,
  spark: <path d="M12 3l1.800 5.400L19 10l-5.200 1.600L12 17l-1.800-5.400L5 10l5.200-1.600L12 3Zm7 12 .800 2.200L22 18l-2.200.800L19 21l-.800-2.200L16 18l2.200-.800L19 15Z" />,
  sound: <path d="M4 9v6h4l5 4V5L8 9H4Zm12.500-.500a5 5 0 0 1 0 7M19 6a8.500 8.500 0 0 1 0 12" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** Coriandoli dorati per festeggiare. Si esauriscono da soli. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    const colors = ['#e2b76a', '#f6d99b', '#fff4dc', '#b98a45', '#7fc58f', '#e5766a'];
    const parts = Array.from({ length: 150 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.42,
      vx: (Math.random() - 0.5) * 22 * dpr,
      vy: (-Math.random() * 20 - 5) * dpr,
      size: (4 + Math.random() * 7) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      g.clearRect(0, 0, w, h);
      frame++;
      for (const p of parts) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = Math.max(0, 1 - frame / 200);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
      }
      if (frame < 200) raf = requestAnimationFrame(tick);
      else g.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="confetti" />;
}

/** Barra di valutazione verticale: la parte chiara cresce quando sta meglio il Bianco. */
export function EvalBar({ cp, mate, flipped }: { cp: number | null; mate: number | null; flipped: boolean }) {
  let white = 50;
  let label = '0.0';
  if (mate !== null) {
    // mate === 0: la posizione è già matto, vince chi ha la valutazione dalla sua parte.
    white = mate > 0 || (mate === 0 && (cp ?? 0) > 0) ? 100 : 0;
    label = mate === 0 ? '#' : `M${Math.abs(mate)}`;
  } else if (cp !== null) {
    white = 50 + 50 * (2 / (1 + Math.exp(-cp / 250)) - 1);
    label = Math.abs(cp / 100).toFixed(1);
  }
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`} title="Valutazione del motore">
      <div className="eval-white" style={{ height: `${white}%` }} />
      <span className={`eval-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  );
}
