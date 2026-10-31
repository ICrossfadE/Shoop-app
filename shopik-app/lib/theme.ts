export const themes = ['light', 'dark', 'pink', 'light-blue', 'light-green', 'light-pink'] as const;
export type Theme = typeof themes[number];
export const themeCookie = 'shopik-theme';
export const themeLabels: Record<Theme, string> = {
  light: 'Світла', dark: 'Темна', pink: 'Рожева',
  'light-blue': 'Світла блакитна', 'light-green': 'Світла зелена', 'light-pink': 'Світла рожева',
};
// Never interpolate arbitrary cookie or action values into CSS/HTML.
export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && themes.some((theme) => theme === value);
}
// Account preferences take precedence over a previous account's browser cookie.
export function resolveTheme(authenticated: boolean, profile: unknown, cookie: unknown): Theme {
  return authenticated ? (isTheme(profile) ? profile : 'light') : (isTheme(cookie) ? cookie : 'light');
}
// CSS accepts native appearance keywords, never palette identifiers.
export function themeColorScheme(theme: Theme): 'light' | 'dark' {
  return theme === 'dark' ? 'dark' : 'light';
}
