'use client';
import { themes, themeLabels } from '@/lib/theme';
import { useTheme } from '../components/ThemeProvider';
// Explicit choices share pending and rollback with the header.
export default function ThemePicker() {
  const { selected, pending, error, notice, choose } = useTheme();
  return <div className="space-y-3">
    {/* All palettes remain explicit keyboard-accessible choices. */}
    <div role="group" aria-label="Колірна тема" className="theme-options">
      {themes.map((theme) => <button key={theme} disabled={pending} aria-pressed={selected === theme} onClick={() => choose(theme)} className={`rounded border px-3 py-2 ${selected === theme ? 'button-primary' : 'bg-surface text-foreground border-line'}`}>{themeLabels[theme]}</button>)}
    </div>
    {error && <p role="alert" className="text-danger">{error} Натисніть потрібну тему для повторної спроби.</p>}
    <p role="status" className="text-sm text-muted">{pending ? 'Збереження…' : notice}</p>
  </div>;
}
