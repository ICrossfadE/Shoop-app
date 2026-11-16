import type { AuthView, MobileAuth } from './auth.ts';

// Authentication UI never renders SDK errors, callback URLs or credentials.
export function AuthPanel({ auth, view, busy, run }: {
  auth: MobileAuth | null; view: AuthView; busy: boolean;
  run(action: () => Promise<unknown>): void;
}) {
  const account = view.state.status === 'signed-out' ? null : view.state.account;
  return <section className="panel" aria-label="Акаунт">
    {/* Only server verification grants sync access; offline identity remains display context. */}
    <h2>Акаунт Google</h2>
    {!auth ? <p>Вхід доступний у налаштованому Android-застосунку.</p> : <>
      <p>{account ? account.name : 'Увійдіть, щоб підключити ваш акаунт Shopik.'}</p>
      {account && <p>{view.verification === 'verified' ? 'Акаунт підтверджено. Завантаження покупок буде підключено на наступних етапах.' :
        view.verification === 'unavailable' ? 'Сервер недоступний. Локальні дані збережено; доступ до синхронізації ще не підтверджено.' : 'Потрібно повторно підтвердити вхід. Локальні дані збережено.'}</p>}
      {view.pending ? <>
        <p role="status">Завершіть вхід у системному браузері або скасуйте спробу.</p>
        <button disabled={busy} onClick={() => run(auth.cancel)}>Скасувати вхід</button>
      </> : <button disabled={busy} onClick={() => run(auth.signIn)}>{account ? 'Увійти повторно / змінити акаунт' : 'Увійти через Google'}</button>}
      {account && <button className="secondary" disabled={busy || view.pending} onClick={() => run(auth.signOut)}>Вийти на цьому пристрої</button>}
    </>}
  </section>;
}
