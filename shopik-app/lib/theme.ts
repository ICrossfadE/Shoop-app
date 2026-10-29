export type Theme = 'light' | 'dark';
export const themeCookie = 'shopik-theme';

// Never interpolate arbitrary cookie or action values into CSS/HTML.
export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}
export function resolveTheme(authenticated: boolean, profile: unknown, cookie: unknown): Theme {
  return authenticated ? (isTheme(profile) ? profile : 'light') : (isTheme(cookie) ? cookie : 'light');
}
