'use client';
import Image from 'next/image';
import { useState } from 'react';
import { initials, safeAvatarUrl } from '@/lib/identity';

// A failed or missing image falls back to initials without a broken image icon.
export default function Avatar({ name, url }: { name: string; url: string }) {
  const source = safeAvatarUrl(url);
  const [failed, setFailed] = useState('');
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-soft text-xs font-semibold text-foreground" aria-hidden="true">
    {source && failed !== source ? <Image unoptimized src={source} alt="" width={32} height={32} referrerPolicy="no-referrer" onError={() => setFailed(source)} className="h-8 w-8 object-cover" /> : initials(name)}
  </span>;
}
