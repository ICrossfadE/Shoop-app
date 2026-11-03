import type { Category } from './categories';

// Category memory is scoped to the account and workspace, never shared globally.
export function lastCategoryKey(userId: string, workspaceId: string) {
  return `last-category:${userId}:${workspaceId}`;
}

// An explicit category wins over memory; deleted remembered values are ignored.
export function chooseCategory(categories: Category[], explicit?: string | null, remembered?: string | null) {
  return [explicit, remembered].find(id => categories.some(category => category.id === id)) ?? categories[0]?.id ?? '';
}
