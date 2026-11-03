import { tagTextColor, type Tag } from "@/lib/tags";
import { IconCheck, IconTag } from "@tabler/icons-react";

// One presentation keeps colors consistent across tags, products and expenses.
export default function TagBadge({
  tag,
  selected = false,
}: {
  tag: Pick<Tag, "name" | "color">;
  selected?: boolean;
}) {
  return (
    <span
      className="tag-badge"
      style={{ backgroundColor: tag.color, color: tagTextColor(tag.color) }}
    >
      {/* Keep selection and tag glyphs decorative; the parent button supplies its name. */}
      {selected && <IconCheck size={14} aria-hidden="true" />}
      <IconTag size={14} aria-hidden="true" />
      {tag.name}
    </span>
  );
}
