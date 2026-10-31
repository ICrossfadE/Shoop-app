'use client';
import { isTheme, themes, themeLabels } from '@/lib/theme';
import { useTheme } from './ThemeProvider';
// Native select keeps six palettes compact with built-in keyboard and Escape behavior.
export default function ThemeToggle() {
  const { selected, pending, error, choose } = useTheme();
  return <div className="header-theme">
    <label className="sr-only" htmlFor="header-theme">Колірна тема</label>
    <select id="header-theme" value={selected} disabled={pending} aria-busy={pending} onChange={(event) => { if (isTheme(event.target.value)) choose(event.target.value); }}>
      {themes.map((theme) => <option key={theme} value={theme}>{themeLabels[theme]}</option>)}
    </select>
    {error && <p role="alert" className="max-w-48 text-sm text-danger">{error}</p>}
  </div>;
}
