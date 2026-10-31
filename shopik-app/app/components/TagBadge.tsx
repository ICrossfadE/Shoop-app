import { tagTextColor, type Tag } from '@/lib/tags';

// One presentation keeps colors consistent across tags, products and expenses.
export default function TagBadge({ tag }: { tag: Pick<Tag, 'name' | 'color'> }) {
  return <span className="tag-badge" style={{ backgroundColor: tag.color, color: tagTextColor(tag.color) }}><span aria-hidden="true" className="tag-hash">#</span>{tag.name}</span>;
}
