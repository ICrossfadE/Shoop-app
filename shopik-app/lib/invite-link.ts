import { isInviteToken } from './invites.ts';

// Only extract a secret from the current app origin; never navigate to pasted URLs.
export function tokenFromInviteLink(value: string, origin: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.origin !== origin || url.username || url.password || url.pathname !== '/invite' || url.search) return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.get('token');
    return fragment.size === 1 && isInviteToken(token) ? token : null;
  } catch { return null; }
}
