import type { NavigationAdapter, Screen } from '../../../shopik-app/lib/domain/index.ts';

type RouteStorage = Pick<Storage, 'getItem' | 'setItem'>;
const key = 'shopik-mobile:route:v1';
export const screens = ['products', 'expenses', 'settings'] as const;

// Persist only an allowlisted screen, never tokens, filters, URLs or account data.
export function restoreScreen(value: string | null): Screen {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 &&
        'screen' in parsed && screens.includes(parsed.screen as Screen)) return parsed.screen as Screen;
  } catch { /* Corrupt or obsolete preferences safely open the product screen. */ }
  return 'products';
}

// OS URLs may select a local screen only; auth/invite callbacks need their own adapters.
export function screenFromLocalUrl(value: string): Screen | null {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://localhost' || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname === '/') return 'products';
    return screens.find(screen => url.pathname === `/${screen}`) ?? null;
  } catch { return null; }
}

// A bounded in-memory history supports Back while restored routes retain a root exit.
export function createNavigation(storage?: RouteStorage, onPersistenceError: () => void = () => {}): NavigationAdapter {
  let initial: Screen = 'products';
  try { initial = restoreScreen(storage?.getItem(key) ?? null); }
  catch { onPersistenceError(); }
  const history: Screen[] = initial === 'products' ? ['products'] : ['products', initial];
  const listeners = new Set<(screen: Screen) => void>();
  // Storage failure must never prevent in-memory navigation or the Android Back action.
  function publish() {
    const screen = history[history.length - 1];
    try { storage?.setItem(key, JSON.stringify({ version: 1, screen })); }
    catch { onPersistenceError(); }
    for (const listener of listeners) listener(screen);
  }
  return {
    current: () => history[history.length - 1],
    navigate(screen) {
      if (!screens.includes(screen)) throw new Error('Невідомий екран.');
      if (screen === history[history.length - 1]) return;
      history.push(screen);
      if (history.length > 20) history.splice(1, 1);
      publish();
    },
    back() {
      if (history.length === 1) return false;
      history.pop(); publish(); return true;
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
