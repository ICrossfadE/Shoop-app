import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { themes, themeLabels, themeColorScheme, isTheme } from '../../shopik-app/lib/domain/index.ts';
import { createNavigation, screenFromLocalUrl } from './adapters/navigation.ts';
import { createThemeAdapter } from './adapters/theme.ts';
import { createAndroidLifecycle } from './adapters/lifecycle.ts';
import { createAndroidAuth } from './adapters/supabase-auth.ts';
import { AuthPanel } from './AuthPanel.tsx';
import type { AuthView } from './auth.ts';
import { LocalRepositoryProbe } from './LocalRepositoryProbe.tsx';
import { StorageProbe } from './StorageProbe.tsx';

// Preferences contain only appearance and screen names, with no session/account data.
function deviceStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

// A local fallback remains usable when a component cannot render in the WebView.
export class MobileErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fallback panel" role="alert">
      <h1>Не вдалося відкрити Shopik</h1>
      <p>Спробуйте перезапустити застосунок. Локальні дані не очищуються.</p>
      <button onClick={() => window.location.reload()}>Спробувати знову</button>
    </main>;
    return this.props.children;
  }
}

// The shell owns platform services; screens never import Next navigation or actions.
export function MobileApp() {
  const [navigation] = useState(() => createNavigation(deviceStorage()));
  const [themeAdapter] = useState(() => createThemeAdapter(deviceStorage()));
  const [screen, setScreen] = useState(navigation.current);
  const [theme, setTheme] = useState(themeAdapter.load);
  const [online, setOnline] = useState(navigator.onLine);
  const [resumeVersion, setResumeVersion] = useState(0);
  const [error, setError] = useState('');
  const [auth] = useState(createAndroidAuth);
  const [authView, setAuthView] = useState<AuthView>(() => auth?.current() ?? { state: { status: 'signed-out' }, verification: 'unverified', pending: false });
  const [authBusy, setAuthBusy] = useState(false);
  // Show a fixed message instead of leaking native/SDK errors that may contain secrets.
  function runAuth(action: () => Promise<unknown>) {
    setAuthBusy(true); setError('');
    void action().catch(() => setError('Не вдалося завершити авторизацію. Перевірте мережу й налаштування входу та спробуйте знову.'))
      .finally(() => setAuthBusy(false));
  }
  useEffect(() => {
    if (!auth) return;
    let active = true;
    const stop = auth.subscribe(value => { if (active) setAuthView(value); });
    const read = () => { void auth.read().catch(() => { if (active) setError('Не вдалося прочитати захищену сесію. Локальні покупки не очищено.'); }); };
    read(); window.addEventListener('online', read); window.addEventListener('offline', read);
    return () => { active = false; stop(); window.removeEventListener('online', read); window.removeEventListener('offline', read); };
  }, [auth]);
  const main = useRef<HTMLElement>(null);

  // Navigation and focus restoration stay inside this local client.
  useEffect(() => navigation.subscribe(setScreen), [navigation]);
  useEffect(() => { main.current?.focus({ preventScroll: true }); }, [screen]);

  // Apply validated palette tokens before paint, including the WebView color scheme.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = themeColorScheme(theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
  }, [theme]);

  // Connection status is a hint; it must not clear a session or confirm server access.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  // Listen for cold/warm URL events and resumes without persisting any raw URL.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void createAndroidLifecycle().subscribe(event => {
      if (disposed) return;
      if (event.kind === 'resume') { setOnline(navigator.onLine); setResumeVersion(value => value + 1); if (auth) void auth.read().catch(() => setError('Не вдалося перевірити сесію.')); }
      if (event.kind === 'open-url') {
        if (auth) void auth.handleUrl(event.url).catch(() => setError('Не вдалося завершити вхід. Почніть нову спробу.'));
        const destination = screenFromLocalUrl(event.url);
        if (destination) navigation.navigate(destination);
      }
    }).then(cleanup => { if (disposed) cleanup(); else stop = cleanup; })
      .catch(() => { if (!disposed) setError('Не вдалося підключити події Android. Перезапустіть застосунок.'); });
    const back = App.addListener('backButton', () => {
      if (disposed) return;
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (dialog) { dialog.close(); return; }
      const popover = document.querySelector<HTMLElement>(':popover-open');
      if (popover) { popover.hidePopover(); return; }
      if (!navigation.back()) void App.exitApp().catch(() => setError('Не вдалося закрити застосунок.'));
    });
    void back.catch(() => { if (!disposed) setError('Кнопка «Назад» тимчасово недоступна.'); });
    return () => { disposed = true; stop?.(); void back.then(handle => handle.remove()).catch(() => undefined); };
  }, [navigation, auth]);

  // Appearance changes locally right away; a write failure never claims it was persisted.
  function selectTheme(value: string) {
    if (!isTheme(value)) return;
    setTheme(value);
    try { themeAdapter.save(value); setError(''); }
    catch { setError('Тему застосовано, але не вдалося зберегти для наступного запуску.'); }
  }

  return <div className="app-shell">
    {/* Local wordmark and shell share the web palette, without external fonts/assets. */}
    <header><span className="brand">Shopik<span className="brand-dot">.</span></span><span className="badge">Android · прототип</span></header>
    <p className="connection" role="status">{online ? 'Є мережеве підключення' : 'Без мережі · локальний запуск'}</p>
    <main ref={main} tabIndex={-1} id="screen-content">
      <AuthPanel auth={auth} view={authView} busy={authBusy} run={runAuth} />
      {error && <p className="error" role="alert">{error}</p>}
      {screen === 'products' && <section aria-labelledby="products-title" className="panel">
        {/* Before authentication, no sample purchases are presented as real account data. */}
        <p className="eyebrow">Покупки</p>
        <h1 id="products-title">Списки покупок.<br />Завжди поруч.</h1>
        <p>Для першого входу та завантаження вашого простору потрібна мережа.</p>
        <p>Ваші покупки з’являться після входу та підключення початкової синхронізації на наступних етапах.</p>
        <button onClick={() => navigation.navigate('settings')}>Відкрити налаштування</button>
      </section>}
      {screen === 'expenses' && <section aria-labelledby="expenses-title" className="panel">
        {/* An unavailable month is distinct from a downloaded month with zero expenses. */}
        <p className="eyebrow">Витрати</p>
        <h1 id="expenses-title">Історія ваших покупок</h1>
        <p>Дані витрат ще не завантажено. Для першого завантаження потрібні вхід і підключення до мережі.</p>
        <p>Після синхронізації тут будуть збережені місяці витрат. Незавантажені дані не враховуються як нуль.</p>
      </section>}
      {screen === 'settings' && <>
        <section aria-labelledby="settings-title" className="panel">
          {/* Device appearance is available before first sign-in and without connectivity. */}
          <p className="eyebrow">Налаштування</p><h1 id="settings-title">Ваш Shopik</h1>
          <label htmlFor="device-theme">Колірна тема</label>
          <select id="device-theme" value={theme} onChange={event => selectTheme(event.target.value)}>
            {themes.map(item => <option key={item} value={item}>{themeLabels[item]}</option>)}
          </select>
          <p>Тема зберігається на цьому пристрої та працює без мережі.</p>
          <p className="muted">Акаунт доступний у блоці входу. Керування просторами буде підключено на наступних етапах.</p>
        </section>
        {/* Keep diagnostics outside the shopping flow and label all fixtures as test data. */}
        <details className="diagnostics"><summary>Репозиторій та outbox · етап 024</summary><LocalRepositoryProbe resumeVersion={resumeVersion} /></details>
        <details className="diagnostics"><summary>Перевірка локального збереження</summary><StorageProbe resumeVersion={resumeVersion} /></details>
      </>}
    </main>
    {/* Only fixed screen identifiers are persisted; no server/router library is required. */}
    <nav aria-label="Основна навігація">
      {([['products', 'Покупки'], ['expenses', 'Витрати'], ['settings', 'Налаштування']] as const).map(([route, label]) =>
        <button key={route} className="secondary" aria-current={screen === route ? 'page' : undefined}
          onClick={() => navigation.navigate(route)}>{label}</button>)}
    </nav>
  </div>;
}
