'use client';
import { useEffect, useState, useTransition } from 'react';
import { saveTheme } from './actions';
import type { Theme } from '@/lib/theme';

// Apply instantly, but roll back the preview and show errors if saving fails.
export default function ThemePicker({ initial }: { initial: Theme }) {
  const [selected, setSelected] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Keep browser appearance in an effect; initial HTML is already themed by SSR.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', selected);
    document.documentElement.style.setProperty('color-scheme', selected);
  }, [selected]);
  function apply(theme: Theme) {
    setSelected(theme);
  }
  function choose(theme: Theme) {
    if (pending || selected === theme) return;
    const previous = selected;
    setError(''); setNotice(''); apply(theme);
    startTransition(async () => {
      try {
        const result = await saveTheme(theme);
        if (!result.ok) { apply(previous); setError(result.error); }
        else setNotice('Тему збережено.');
      } catch { apply(previous); setError('Не вдалося зберегти тему. Спробуйте ще раз.'); }
    });
  }
  return <div className="space-y-3">
    {/* Two explicit choices keep system appearance from overriding the account. */}
    <div role="group" aria-label="Колірна тема" className="flex flex-wrap gap-3">
      {(['light', 'dark'] as const).map((theme) => <button key={theme} disabled={pending} aria-pressed={selected === theme} onClick={() => choose(theme)} className={`rounded border px-4 py-3 disabled:opacity-50 ${selected === theme ? 'bg-blue-600 text-white' : 'bg-surface text-foreground border-line'}`}>{theme === 'light' ? 'Світла' : 'Темна'}</button>)}
    </div>
    {error && <p role="alert" className="text-danger">{error} Натисніть потрібну тему для повторної спроби.</p>}
    <p role="status" className="text-sm text-muted">{pending ? 'Збереження…' : notice}</p>
  </div>;
}
