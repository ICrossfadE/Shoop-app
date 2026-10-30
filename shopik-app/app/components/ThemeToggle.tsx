'use client';
import { useState, useTransition } from 'react';
import { saveTheme } from '../settings/actions';

// Use the same profile/cookie action as settings, with rollback on failure.
export default function ThemeToggle() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  function toggle() {
    const root = document.documentElement;
    const previous = root.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = previous === 'dark' ? 'light' : 'dark';
    setError('');
    root.dataset.theme = next; root.style.colorScheme = next;
    startTransition(async () => {
      try {
        const result = await saveTheme(next);
        if (result.ok) return;
        setError(result.error);
      } catch { setError('Не вдалося зберегти тему.'); }
      root.dataset.theme = previous; root.style.colorScheme = previous;
    });
  }
  return <div><button className="icon-action" aria-label="Перемкнути світлу / темну тему" disabled={pending} onClick={toggle}>◐</button>{error && <p role="alert" className="max-w-48 text-sm text-danger">{error}</p>}</div>;
}
