// Client-safe invitation shapes contain neither raw tokens nor database hashes.
export const inviteCookie = 'shopik-invite';
export const inviteCookieOptions = { path: '/invite', httpOnly: true, sameSite: 'lax' as const, maxAge: 1800 };
export type InviteSummary = { id: string; operation_id: string; created_at: string; expires_at: string; state: 'pending' | 'accepted' | 'revoked' | 'expired' };
export type InviteView = { status: 'ready' | 'member' | 'accepted'; workspace_id: string; workspace_name: string; owner_name: string }
  | { status: 'missing' | 'login' | 'invalid' | 'expired' | 'revoked' | 'used' | 'limited' | 'error' };
export type InviteCreateResult = { status: 'created' | 'existing'; invite: InviteSummary } | { status: 'invalid' | 'limited' | 'capacity' };
export type InviteListResult = { status: 'ok'; invites: InviteSummary[] } | { status: 'limited' };
// Enforce the fixed-size URL-safe secret before any token lookup.
export function isInviteToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
// OAuth continuation is an enum, never a user-supplied redirect URL.
export function authDestination(flow: unknown): '/' | '/invite' {
  return flow === 'invite' ? '/invite' : '/';
}
