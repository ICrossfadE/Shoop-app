import type { TaggedProduct } from '@/lib/tags';
import TagBadge from './TagBadge';

type Props = {
  product: TaggedProduct; pending: boolean;
  onEdit: (trigger: HTMLElement) => void; onStatus: () => void; onDelete: () => void;
};
const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });

// Present one persisted product and its explicit edit, completion and delete actions.
export default function OrderCard({ product, pending, onEdit, onStatus, onDelete }: Props) {
  const completed = product.status === 'completed';
  return (
    <article className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      {/* Product details wrap on narrow screens and for long names. */}
      <div className="min-w-0 space-y-2 break-words [overflow-wrap:anywhere]">
        <h3 className={`text-lg font-semibold ${completed ? 'text-zinc-500 line-through' : ''}`}>{product.name}</h3>
        {product.description && <p className="whitespace-pre-wrap text-zinc-600">{product.description}</p>}
        <p className="font-semibold">{money.format(product.price)}</p>
        <p className="text-sm text-zinc-600">{completed ? 'Завершено' : 'Активний'}</p>
        <ul aria-label="Теги продукту" className="flex flex-wrap gap-2">{product.tags.map((tag) => <li key={tag.id}><TagBadge tag={tag} /></li>)}</ul>
      </div>
      {/* Wrapping actions preserve usable buttons on mobile. */}
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} onClick={onStatus} className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50">{completed ? 'Повернути в активні' : 'Завершити'}</button>
        <button disabled={pending} onClick={(event) => onEdit(event.currentTarget)} className="rounded border border-zinc-400 px-3 py-2 disabled:opacity-50">Редагувати</button>
        <button disabled={pending} onClick={onDelete} className="rounded border border-red-400 px-3 py-2 text-red-700 disabled:opacity-50">Видалити</button>
      </div>
    </article>
  );
}
