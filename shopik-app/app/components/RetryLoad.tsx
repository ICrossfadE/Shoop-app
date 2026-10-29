'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Recovery is available on error without bringing back a permanent refresh control.
export default function RetryLoad() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="mt-2 rounded border px-3 py-2 disabled:opacity-50">{pending ? 'Повторюємо…' : 'Спробувати знову'}</button>;
}
