'use client';
import { useEffect, useState } from 'react';
// Network state is advisory; server responses remain the authority for successful writes.
export default function LocalDataStatus() {
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const network = () => setOffline(!navigator.onLine);
    const failed = () => setError(true);
    network();
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('shopik-storage-error', failed);
    return () => { window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('shopik-storage-error', failed); };
  }, []);
  return <>{offline && <p role="status" className="mx-auto max-w-4xl p-3">Без інтернету. Доступні раніше завантажені списки. Зміни ще не відправляються автоматично після підключення.</p>}{error && <p role="alert" className="mx-auto max-w-4xl p-3 text-danger">Локальне збереження недоступне. Чернетки можуть не зберегтися після закриття вкладки.</p>}</>;
}
