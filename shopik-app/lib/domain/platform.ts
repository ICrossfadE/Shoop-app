import type { Account } from '../identity.ts';
import type { ListData, ListFilter, MutationResult } from './list-model.ts';
import type { ProductFields } from '../products.ts';
import type { Screen, WorkspaceBoot } from '../workspace-boot.ts';
import type { Theme } from '../theme.ts';

// A new membership epoch must never inherit pending work from an earlier membership.
export type WorkspaceScope = Readonly<{ accountId: string; workspaceId: string; membershipEpoch: string }>;
export type Unsubscribe = () => void;
export type LocalEntityKey = `local:${string}`;
export type AuthState = { status: 'signed-out' } | { status: 'signed-in' | 'needs-auth'; userId: string; account: Account };
export interface AuthAdapter {
  read(): Promise<AuthState>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: (state: AuthState) => void): Unsubscribe;
}

// This is a UI transport contract, not the durable/revision-aware sync protocol 025.
export type WorkspaceCommand =
  | { kind: 'save-product'; id: string | null; fields: ProductFields }
  | { kind: 'delete-product'; id: string }
  | { kind: 'complete-products'; items: { id: string; amount: number; updated_at: string }[] }
  | { kind: 'save-category'; id: string | null; name: string }
  | { kind: 'delete-category'; id: string }
  | { kind: 'create-tag'; name: string; color: string }
  | { kind: 'delete-tag'; id: string }
  | { kind: 'correct-expense'; id: string; amount: number; expectedAmount: number };
export interface WorkspaceReader {
  bootstrap(): Promise<WorkspaceBoot>;
  read(scope: WorkspaceScope, filter: ListFilter): Promise<ListData>;
}
export interface WorkspaceWriter {
  execute(scope: WorkspaceScope, operationId: string, command: WorkspaceCommand): Promise<MutationResult>;
}

// Navigation exposes product screens only; arbitrary URLs cannot become routes.
export interface NavigationAdapter {
  current(): Screen;
  navigate(screen: Screen): void;
  back(): boolean;
  subscribe(listener: (screen: Screen) => void): Unsubscribe;
}
export type LifecycleEvent = { kind: 'resume' | 'pause' } | { kind: 'open-url'; url: string };
export interface LifecycleAdapter {
  subscribe(listener: (event: LifecycleEvent) => void): Promise<Unsubscribe>;
}
export interface ThemeAdapter {
  load(): Theme;
  save(theme: Theme): void;
}
export interface InvitationLinks {
  parse(value: string): string | null;
  create(token: string): string;
}

// Credentials must be implemented separately with Keystore; never use the data outbox.
export interface CredentialStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface ScopedStorage<Value> {
  read(scope: WorkspaceScope): Promise<Value | null>;
  write(scope: WorkspaceScope, value: Value): Promise<void>;
  remove(scope: WorkspaceScope): Promise<void>;
}
