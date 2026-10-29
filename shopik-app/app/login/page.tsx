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
    <main className="flex flex-1 items-center justify-center bg-page px-5 py-12 text-foreground">
      <section className="w-full max-w-sm space-y-6 rounded-xl bg-surface p-6 shadow">
        <h1 className="text-3xl font-bold">Shopik</h1>
        <p>Увійдіть, щоб відкрити свій простір покупок.</p>
        {error && <p role="alert" className="text-sm text-danger">Вхід не завершено. Спробуйте ще раз.</p>}
        {configured ? <GoogleSignIn /> : <p role="alert">Підключення ще не налаштоване. Додайте параметри Supabase у .env.local та перезапустіть застосунок.</p>}
      </section>
    </main>
  );
}
