import { creationDate, type ProductAuthor } from '@/lib/identity';
import Avatar from './Avatar';

// Display the creator, never substitute the current viewer for another author.
export default function AuthorInfo({ author, createdAt }: { author?: ProductAuthor; createdAt?: string }) {
  const name = author?.display_name.trim() || 'Невідомий автор';
  const timestamp = author?.created_at ?? createdAt;
  return <div className="product-author flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
    <Avatar name={name} url={author?.avatar_url ?? ''} /><div className="min-w-0"><p className="break-words">{name}</p><p>Створено: {timestamp ? <time dateTime={timestamp}>{creationDate(timestamp)}</time> : 'Дата невідома'}</p></div>
  </div>;
}
