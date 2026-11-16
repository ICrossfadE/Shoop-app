// Both clients consume these canonical modules; this boundary has no Next/React/DOM.
export * from '../products.ts';
export * from '../categories.ts';
export * from '../tags.ts';
export * from '../money.ts';
export * from '../expenses.ts';
export * from '../identity.ts';
export * from '../shopping.ts';
export * from '../theme.ts';
export * from '../workspace-name.ts';
export * from '../permissions.ts';
export * from '../expense-chart.ts';
export * from './list-model.ts';
export type { WorkspaceBoot, Screen } from '../workspace-boot.ts';
export type { WorkspacePerson, WorkspaceOption } from '../members.ts';
export type { Database } from '../supabase/database.types.ts';
export type { InviteView, InviteSummary } from '../invites.ts';
export * from './platform.ts';
