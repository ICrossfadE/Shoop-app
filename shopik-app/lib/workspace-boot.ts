import type { Account } from './identity';
import type { Category } from './categories';
import type { Tag } from './tags';
import type { Theme } from './theme';
import type { ListData, ListFilter } from './list-model';
export type Screen = 'products' | 'expenses' | 'settings';
export type WorkspaceBoot = {
  revokedWorkspaceId?: string;
  membershipVersion?: string;
  userId: string; email: string; account: Account;
  workspace: { workspace_id: string; workspace_name: string; member_role: 'owner' | 'member' };
  categories: Category[]; tags: Tag[]; categoriesError: boolean; tagsError: boolean;
  theme: { theme: Theme; userId: string; error: boolean };
  initialFilter: ListFilter; initial?: ListData; loadError: boolean;
};
