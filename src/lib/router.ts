import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const snapshot = () => window.location.hash;

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const [p, q = ''] = hash.replace(/^#\/?/, '').split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function href(path: string, query?: Record<string, string>) {
  const q = query ? '?' + new URLSearchParams(query).toString() : '';
  return `#/${path}${q}`;
}

export function navigate(path: string, query?: Record<string, string>) {
  window.location.hash = href(path, query);
  window.scrollTo({ top: 0 });
}
