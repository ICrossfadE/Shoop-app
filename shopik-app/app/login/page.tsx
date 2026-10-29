import { redirect } from 'next/navigation';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import GoogleSignIn from './GoogleSignIn';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = Boolean(getSupabaseConfig());
  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims.sub) redirect('/');
  }
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-5 py-12 text-zinc-900">
      <section className="w-full max-w-sm space-y-6 rounded-xl bg-white p-6 shadow">
        <h1 className="text-3xl font-bold">Shopik</h1>
        <p>Увійдіть, щоб відкрити свій простір покупок.</p>
        {error && <p role="alert" className="text-sm text-red-700">Вхід не завершено. Спробуйте ще раз.</p>}
        {configured ? <GoogleSignIn /> : <p role="alert">Підключення ще не налаштоване. Додайте параметри Supabase у .env.local та перезапустіть застосунок.</p>}
      </section>
    </main>
  );
}
