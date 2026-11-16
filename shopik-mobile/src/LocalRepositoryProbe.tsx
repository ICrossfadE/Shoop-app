import { useEffect, useRef, useState } from 'react';
import { openLocalRepository, type LocalRepository, type RepositoryView } from './repository/index.ts';

const diagnosticScope = { accountId: '00000000-0000-0000-0000-000000000024', workspaceId: '00000000-0000-0000-0000-000000000024', membershipEpoch: 'diagnostic-v1' };
const localId = () => (`local:${crypto.randomUUID()}` as const);

// Explicit test fixtures exercise the new repository without impersonating account data or contacting Supabase.
export function LocalRepositoryProbe({ resumeVersion }: { resumeVersion: number }) {
  const repository = useRef<LocalRepository | null>(null);
  const [view, setView] = useState<RepositoryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let disposed = false;
    void openLocalRepository().then(async store => {
      if (disposed) { store.close(); return; }
      repository.current = store;
      const current = await store.load(diagnosticScope); if (!disposed) setView(current);
    }).catch(() => { if (!disposed) setError('Репозиторій недоступний. Дані не очищено.'); });
    return () => { disposed = true; repository.current?.close(); repository.current = null; };
  }, []);
  // Reload on resume to inspect committed disk state without creating another action.
  useEffect(() => {
    let disposed = false; const store = repository.current;
    if (store) void store.load(diagnosticScope).then(current => { if (!disposed) setView(current); })
      .catch(() => { if (!disposed) setError('Не вдалося перечитати репозиторій.'); });
    return () => { disposed = true; };
  }, [resumeVersion]);
  async function reload() {
    if (!repository.current || busy) return;
    try { setView(await repository.current.load(diagnosticScope)); setError(''); }
    catch { setError('Не вдалося перечитати репозиторій.'); }
  }
  // Each accepted step commits both projection and intention; a failed chain reports partial progress honestly.
  async function createChain() {
    const store = repository.current; if (!store || busy) return;
    setBusy(true); setError(''); setNotice('');
    const category = localId(), tag = localId(), product = localId(), expense = localId();
    try {
      await store.accept(diagnosticScope, { kind: 'category.create', id: category, name: 'Тестова категорія 024' });
      await store.accept(diagnosticScope, { kind: 'tag.create', id: tag, name: 'Тестовий тег 024', color: '#22633D' });
      await store.accept(diagnosticScope, { kind: 'product.save', id: product, categoryId: category, tagIds: [tag], name: 'Тестова покупка 024', description: 'Діагностика без синхронізації', price: '12.50', quantity: '2' });
      await store.accept(diagnosticScope, { kind: 'product.complete', items: [{ id: product, amount: '24.00', expenseId: expense }] });
      setNotice('Чотири тестові операції збережено на пристрої. Закрийте застосунок і перечитайте після запуску.');
    } catch { setError('Не всі кроки завершено. Успішно прийняті кроки залишились у черзі; перечитайте дані.'); }
    finally {
      try { setView(await store.load(diagnosticScope)); } catch { setError('Не вдалося прочитати підсумок. Дані не очищено.'); }
      setBusy(false);
    }
  }
  return <section aria-label="Діагностика репозиторію 024" className="panel">
    {/* This scope is isolated from Google accounts; no diagnostic action is sent to the server. */}
    <h2>Репозиторій 024 · тестові дані</h2>
    <p>Окремий тестовий простір: категорія → тег → товар → завершення. Кожне натискання додає ще один набір. Дані не надсилаються на сервер.</p>
    {view && <p>Категорій: {Object.keys(view.workspace.projection.categories).length}; тегів: {Object.keys(view.workspace.projection.tags).length}; витрат: {Object.keys(view.workspace.projection.expenses).length}; операцій у черзі: {view.operations.length}.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button disabled={!view || busy} onClick={() => { void createChain(); }}>Створити тестовий ланцюжок</button>
    <button className="secondary" disabled={!view || busy} onClick={() => { void reload(); }}>Перечитати репозиторій</button>
  </section>;
}
