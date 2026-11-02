// Count Unicode characters consistently with PostgreSQL's 100-character limit.
export function parseWorkspaceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && [...name].length <= 100 && !/[\u0000-\u001f\u007f]/u.test(name) ? name : null;
}
