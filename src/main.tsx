import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/manrope/wght.css';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import './board3d.css';
import { App } from './App.tsx';
import { initAccount } from './lib/account.ts';
import { initTheme } from './lib/theme.ts';

initTheme();
void initAccount();

// App installabile: il service worker tiene in memoria i file per l'uso senza rete.
// Solo nella versione compilata, per non interferire con lo sviluppo.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
