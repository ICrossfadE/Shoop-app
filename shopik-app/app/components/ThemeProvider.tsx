'use client';
import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { saveTheme } from '../settings/actions';
import { themeColorScheme, type Theme } from '@/lib/theme';

type ThemeState = { selected: Theme; pending: boolean; error: string; notice: string; choose: (theme: Theme) => void };
const ThemeContext = createContext<ThemeState | null>(null);
// Persistent layout state synchronizes both controls across client navigation.
export default function ThemeProvider({ initial, children }: { initial: Theme; children: ReactNode }) {
  const [selected, setSelected] = useState(initial);
  const [serverTheme, setServerTheme] = useState(initial);
  // Reconcile refreshed profile data without resetting the application subtree.
  if (serverTheme !== initial) { setServerTheme(initial); setSelected(initial); }
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    document.documentElement.dataset.theme = selected;
    document.documentElement.style.colorScheme = themeColorScheme(selected);
  }, [selected]);
  // Capture the exact palette so a failed save restores colored themes too.
  function choose(theme: Theme) {
    if (pending || theme === selected) return;
    const previous = selected;
    setSelected(theme); setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = await saveTheme(theme);
        if (result.ok) { setNotice('Тему збережено.'); return; }
        setError(result.error);
      } catch { setError('Не вдалося зберегти тему. Спробуйте ще раз.'); }
      setSelected(previous);
    });
  }
  return <ThemeContext.Provider value={{ selected, pending, error, notice, choose }}>{children}</ThemeContext.Provider>;
}
// Header and settings subscribe to one optimistic selection.
export function useTheme() {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('ThemeProvider is required');
  return state;
}
