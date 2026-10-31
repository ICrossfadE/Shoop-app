import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import LoginOptions from './LoginOptions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = Boolean(getSupabaseConfig());
  let authenticated = false;
  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    authenticated = Boolean(data?.claims.sub);
  }
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-page px-5 py-12 text-foreground">
      <section className="w-full max-w-sm space-y-6 rounded-[22px] bg-surface p-6 shadow">
        <h1 className="text-3xl font-bold">Shopik</h1>
        <p>Відкрийте свій простір або приєднайтеся до спільних покупок.</p>
        {error && <p role="alert" className="text-sm text-danger">Вхід не завершено. Спробуйте ще раз.</p>}
        {configured ? <LoginOptions authenticated={authenticated}/> : <p role="alert">Підключення ще не налаштоване. Додайте параметри Supabase у .env.local та перезапустіть застосунок.</p>}
      </section>
    </main>
  );
}
