import type { TaggedProduct, Tag } from './tags';
import type { Category } from './categories';

// Keep existing web imports stable; only focus restoration belongs to the DOM layer.
export * from './domain/list-model.ts';
export type ProductDraft = { trigger?: HTMLElement; key: string; scope: string; userId: string; workspaceId: string; product: TaggedProduct | null; categories: Category[]; tags: Tag[]; selectedCategory: string };
export type CompletionDraft = { key: string; scope: string; workspaceId: string; trigger?: HTMLElement; products: TaggedProduct[] };
