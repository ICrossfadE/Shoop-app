import { isTheme, type ThemeAdapter } from '../../../shopik-app/lib/domain/index.ts';

const key = 'shopik-mobile:device-theme:v1';

// Device appearance is non-private; account theme synchronisation belongs to 028.
export function createThemeAdapter(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): ThemeAdapter {
  return {
    load() {
      try { const value = storage?.getItem(key); return isTheme(value) ? value : 'light'; }
      catch { return 'light'; }
    },
    save(theme) {
      if (!isTheme(theme)) throw new Error('Невідома тема.');
      if (!storage) throw new Error('Сховище налаштувань недоступне.');
      storage.setItem(key, theme);
    },
  };
}
