import { getState, subscribe } from './store.ts';

const system = window.matchMedia('(prefers-color-scheme: light)');

/** Applica l'aspetto scelto: 'auto' segue il dispositivo, anche quando cambia a pagina aperta. */
function apply() {
  const { appearance } = getState().settings;
  const theme = appearance === 'auto' ? (system.matches ? 'light' : 'dark') : appearance;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4eee2' : '#0d0b09');
}

export function initTheme() {
  apply();
  subscribe(apply);
  system.addEventListener('change', apply);
}
