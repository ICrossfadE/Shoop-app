import type { ProductAuthor } from '@/lib/identity';
import Avatar from './Avatar';

// Keep visible metadata minimal while retaining the author's accessible name.
export default function CompactAuthor({ author, timestamp }: { author?: ProductAuthor; timestamp: string }) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: '2-digit' }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return <div className="compact-author text-muted">
    <span role="img" aria-label={author?.display_name || 'Невідомий автор'} title={author?.display_name || 'Невідомий автор'}><Avatar name={author?.display_name || '?'} url={author?.avatar_url || ''} /></span>
    <time dateTime={timestamp}>{value('day')}-{value('month')}-{value('year')}</time>
  </div>;
}
