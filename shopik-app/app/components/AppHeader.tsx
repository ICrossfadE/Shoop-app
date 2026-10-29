import Link from 'next/link';
import type { Account } from '@/lib/identity';
import Avatar from './Avatar';
import SignOutButton from './SignOutButton';

// One header gives every protected page the same visible Google account.
export default function AppHeader({ account, page }: { account: Account; page: 'products' | 'expenses' | 'tags' }) {
  return <header className="bg-zinc-900 text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
    <Link href="/" className="text-2xl font-bold">Shopik</Link>
    <nav aria-label="Основна навігація" className="flex flex-wrap gap-4"><Link href="/" aria-current={page === 'products' ? 'page' : undefined}>Продукти</Link><Link href="/expenses" aria-current={page === 'expenses' ? 'page' : undefined}>Витрати</Link><Link href="/tags" aria-current={page === 'tags' ? 'page' : undefined}>Теги</Link></nav>
    <div className="flex min-w-0 max-w-full items-center gap-3"><Avatar name={account.name} url={account.avatar_url} /><span className="max-w-40 truncate" title={account.name}>{account.name}</span><SignOutButton /></div>
  </div></header>;
}
