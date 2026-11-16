import type { InvitationLinks } from '../../../shopik-app/lib/domain/platform.ts';
import { tokenFromInviteLink } from '../../../shopik-app/lib/invite-link.ts';
import { isInviteToken } from '../../../shopik-app/lib/invites.ts';

// The canonical HTTPS origin must be provided explicitly, never inferred from APK localhost.
export function createInvitationLinks(origin: string): InvitationLinks {
  const canonical = new URL(origin);
  if (canonical.protocol !== 'https:' || canonical.username || canonical.password ||
      canonical.pathname !== '/' || canonical.search || canonical.hash || canonical.hostname === 'localhost') {
    throw new Error('Потрібен канонічний HTTPS origin запрошень.');
  }
  return {
    parse: value => tokenFromInviteLink(value, canonical.origin),
    create(token) {
      if (!isInviteToken(token)) throw new Error('Некоректний токен запрошення.');
      return `${canonical.origin}/invite#token=${token}`;
    },
  };
}
