import { tagTextColor, type Tag } from '@/lib/tags';

// One presentation keeps colors consistent across tags, products and expenses.
export default function TagBadge({ tag }: { tag: Pick<Tag, 'name' | 'color'> }) {
  return <span className="inline-block max-w-full break-words rounded-full px-3 py-1 text-sm [overflow-wrap:anywhere]" style={{ backgroundColor: tag.color, color: tagTextColor(tag.color) }}>{tag.name}</span>;
}
