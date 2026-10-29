import Link from 'next/link';
import type { Account } from '@/lib/identity';
import Avatar from './Avatar';

// One header gives every protected page the same visible Google account.
export default function AppHeader({ account, page }: { account: Account; page: 'products' | 'expenses' | 'settings' }) {
  return <header className="bg-nav text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
    <Link href="/" className="text-2xl font-bold">Shopik</Link>
    <nav aria-label="Основна навігація" className="flex flex-wrap gap-4"><Link href="/" aria-current={page === 'products' ? 'page' : undefined}>Список покупок</Link><Link href="/expenses" aria-current={page === 'expenses' ? 'page' : undefined}>Витрати</Link></nav>
    <Link href="/settings" aria-label={`Налаштування акаунта: ${account.name}`} aria-current={page === 'settings' ? 'page' : undefined} className="flex min-w-0 max-w-full items-center gap-3 rounded outline-offset-4"><Avatar name={account.name} url={account.avatar_url} /><span className="max-w-40 truncate" title={account.name}>{account.name}</span></Link>
  </div></header>;
}
