'use client';

import SignOutButton from './components/SignOutButton';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-page p-6 text-foreground">
      <h1 className="text-xl font-semibold">Не вдалося відкрити Shopik</h1>
      <p role="alert" className="max-w-md text-center">Перевірте підключення. Якщо це перший запуск, переконайтеся, що налаштування Supabase збережені та міграція бази застосована.</p>
      <button onClick={reset} className="rounded button-primary px-4 py-2">Спробувати знову</button>
      <SignOutButton />
    </main>
  );
}
