// Category identity, including the historical name, determines a stable hue.
export function expenseCategoryColor(id: string, name: string): string {
  let hash = 0;
  for (const char of `${id}:${name}`) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  return `hsl(${(hash >>> 0) % 360} 48% 55%)`;
}
