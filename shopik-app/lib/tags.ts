import type { Product } from './products';

export type Tag = { id: string; workspace_id: string; name: string; color: string; created_by: string; created_at: string; updated_at: string };
export type TaggedProduct = Product & { tags: Tag[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Never silently discard malformed filters: doing so would broaden results.
export function parseTagIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !uuid.test(id))) return null;
  return [...new Set((value as string[]).map((id) => id.toLowerCase()))].sort();
}

// Both pages use repeated ?tag= parameters, with deterministic ordering.
export function readTagFilter(value: string | string[] | undefined): string[] | null {
  return parseTagIds(value === undefined ? [] : typeof value === 'string' ? [value] : value);
}

// Normalize the only supported CSS color format before sending it to Postgres.
export function validateTag(name: unknown, color: unknown): { name: string; color: string } | null {
  if (typeof name !== 'string' || typeof color !== 'string') return null;
  const trimmed = name.trim();
  return trimmed && [...trimmed].length <= 120 && /^#[0-9a-f]{6}$/i.test(color)
    ? { name: trimmed, color: color.toUpperCase() } : null;
}

// Relative luminance selects whichever of black/white has higher text contrast.
export function tagTextColor(color: string): '#000000' | '#FFFFFF' {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return '#000000';
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}
