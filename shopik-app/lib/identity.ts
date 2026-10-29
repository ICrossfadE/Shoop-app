export type Account = { name: string; avatar_url: string };
export type ProductAuthor = { product_id: string; display_name: string; avatar_url: string; created_at: string };

// Treat metadata only as display data, never as identity or access permissions.
export function safeAvatarUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export function accountFromClaims(metadata: unknown, email: unknown): Account {
  const data = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  const name = [data.full_name, data.name, email].find((value) => typeof value === 'string' && value.trim());
  return { name: typeof name === 'string' ? name.slice(0,200) : 'Мій акаунт', avatar_url: safeAvatarUrl(data.avatar_url ?? data.picture) };
}

// Bound fallback initials and keep date rendering independent of host timezone.
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0,2).map((part) => [...part][0] ?? '').join('').toLocaleUpperCase('uk') || '?';
}
export function creationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата невідома' : new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
