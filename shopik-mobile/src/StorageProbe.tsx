import { useEffect, useRef, useState } from 'react';
import type { ProbeRepository } from './contracts.ts';
import { createProbe, probeScope } from './probe.ts';
import { openProbeRepository } from './storage.ts';

type Snapshot = Awaited<ReturnType<ProbeRepository['load']>>;

// Keep feasibility data separate from the product screens and production account storage.
export function StorageProbe({ resumeVersion }: { resumeVersion: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const repository = useRef<ProbeRepository | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // Reopen the same on-device database on every cold launch and close on teardown.
  useEffect(() => {
    let disposed = false;
    openProbeRepository().then(async store => {
      if (disposed) { store.close(); return; }
      repository.current = store;
      const data = await store.load(probeScope);
      if (!disposed) { setSnapshot(data); setReady(true); }
    }).catch(() => { if (!disposed) setError('Не вдалося відкрити сховище. Локальне збереження недоступне.'); });
    return () => { disposed = true; repository.current?.close(); repository.current = null; };
  }, []);

  // Reconcile the probe after Android resumes, without creating or clearing operations.
  useEffect(() => {
    let disposed = false;
    const store = repository.current;
    if (store) void store.load(probeScope).then(data => { if (!disposed) setSnapshot(data); })
      .catch(() => { if (!disposed) setError('Не вдалося перечитати локальні дані.'); });
    return () => { disposed = true; };
  }, [resumeVersion]);

  // Await durable storage before displaying success; keep a failure visible to retry.
  async function saveProbe() {
    if (!repository.current || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { record, operation } = createProbe();
      await repository.current.save(record, operation);
      setSnapshot(await repository.current.load(probeScope));
      setNotice('Тестові дані збережено на пристрої. Закрийте й повторно відкрийте застосунок для перевірки.');
    } catch { setError('Не вдалося завершити перевірку запису. Перечитайте сховище, перш ніж повторювати.'); }
    finally { setBusy(false); }
  }

  // Test fixtures may be removed only by an explicit confirmation in the native dialog.
  async function clearProbe() {
    if (!repository.current || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await repository.current.clear(probeScope);
      setSnapshot(await repository.current.load(probeScope));
      setNotice('Тестові дані видалено.');
      dialog.current?.close();
    } catch { setError('Очищення не підтверджене. Перечитайте сховище.'); }
    finally { setBusy(false); }
  }

  // An explicit reload lets testers distinguish persistence from the React state.
  async function reload() {
    if (!repository.current || busy) return;
    setBusy(true); setNotice('');
    try { setSnapshot(await repository.current.load(probeScope)); setError(''); setNotice('Дані повторно прочитано зі сховища.'); }
    catch { setError('Не вдалося прочитати локальне сховище.'); }
    finally { setBusy(false); }
  }

  return <>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <section aria-labelledby="storage-title" className="panel">
        {/* This labelled probe exercises local data, dialog and popover support. */}
        <p className="eyebrow">Технічна перевірка</p>
        <h2 id="storage-title">Дані після перезапуску</h2>
        <p>Збережіть тест, вимкніть мережу, примусово закрийте застосунок і відкрийте його повторно. Категорія, тег, товар та кількість операцій повинні зберегтися.</p>
        {!ready ? <p>Сховище ще не готове.</p> : snapshot?.record ? <div className="stored">
          <h2>{snapshot.record.bundle.product.name}</h2>
          <p>{snapshot.record.bundle.category.name} · {snapshot.record.bundle.tag.name}</p>
          <p>2 × 12,50 ₴ = <strong>25,00 ₴</strong></p>
          <p>Збережено: <time dateTime={snapshot.record.committedAt}>{new Date(snapshot.record.committedAt).toLocaleString('uk-UA')}</time></p>
        </div> : <p className="empty">Тестові дані ще не створені.</p>}
        <p>Локальних тестових операцій: <strong>{snapshot?.operations.length ?? '—'}</strong>. Вони не надсилаються на сервер.</p>
        <div className="actions">
          <button disabled={!ready || busy} onClick={() => void saveProbe()}>{busy ? 'Зачекайте…' : 'Зберегти новий тест'}</button>
          <button className="secondary" disabled={!ready || busy} onClick={() => void reload()}>Перечитати сховище</button>
          <button className="secondary" popoverTarget="probe-menu">Інші дії</button>
        </div>
        <div id="probe-menu" popover="auto" className="popover">
          <button className="secondary" disabled={!ready || busy || !snapshot?.record} onClick={() => {
            document.getElementById('probe-menu')?.hidePopover(); dialog.current?.showModal();
          }}>Очистити тестові дані…</button>
        </div>
      </section>
    <dialog ref={dialog} aria-labelledby="clear-title">
      {/* Native top-layer dialog is part of the minimum Android WebView gate. */}
      <h2 id="clear-title">Видалити тестові дані?</h2>
      <p>Буде видалено лише локальний тест цього прототипу.</p>
      <div className="actions"><button className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Скасувати</button>
        <button disabled={busy} onClick={() => void clearProbe()}>Видалити тест</button></div>
    </dialog>
  </>;
}
