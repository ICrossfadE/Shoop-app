// Membership timestamp prevents an old eviction retry from removing a new membership.
export type WorkspacePerson = { user_id: string; role: 'owner' | 'member'; joined_at: string; display_name: string; avatar_url: string };
export type WorkspaceOption = { id: string; name: string; role: 'owner' | 'member' };
export const workspaceCookie = 'shopik-workspace';
