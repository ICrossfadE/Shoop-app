# Supabase: перший запуск

Етап 007: застосувати лише `supabase/migrations/202610290007_account_settings.sql`, потім виконати весь `supabase/tests/account_settings.sql`. Очікується `PASS: personal themes, validation, profile isolation and metadata sync`. Налаштування доступні на `/settings`, теги — `/settings#tags`, категорії — `/settings#categories`; `/tags` перенаправляє в налаштування. Початкова тема світла. Після зміни схеми перезапустіть dev-сервер.

Етап 006: застосувати тільки `supabase/migrations/202610290006_logic_ui.sql`, потім виконати весь `supabase/tests/logic_ui.sql`. Очікується `PASS: final completion, active lists, immutable tags, scoped authors and deletion`. Попередні міграції не повторювати. Завершені покупки приховані з категорій і не повертаються в активні; створення/збереження та видалення витрат залишаються атомарними.

## Локальні параметри

У `shopik-app/.env.local` додайте:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Для старих проєктів замість publishable key підтримується `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`.env.local` ігнорується Git. Не додавайте сюди service_role, secret key або Google Client Secret.
Після змін перезапустіть dev-сервер; у Vercel ці значення потрібно додати до Environment Variables і виконати redeploy.

## База даних

У Supabase SQL Editor виконайте `supabase/migrations/202610290001_auth_workspaces.sql` один раз.
Міграція атомарна: створює таблиці, індекси, RPC і RLS в одній транзакції.
Для перевірки виконайте `supabase/tests/auth_workspaces.sql` у тестовому проєкті.
Тест перевіряє повторне створення Workspace, ізоляцію двох користувачів, заборону прямої зміни членства й анонімного доступу; наприкінці робить rollback.

## Google OAuth

1. Supabase → Authentication → Sign In / Providers → Google: увімкніть Google та збережіть Client ID і Client Secret із Google Cloud.
2. Google Cloud → OAuth Web Client → Authorized redirect URIs: адреса Supabase `https://YOUR_PROJECT.supabase.co/auth/v1/callback` (точне значення скопіюйте з Supabase).
3. Supabase → Authentication → URL Configuration:
   - локальний Site URL: `http://localhost:3000`;
   - Redirect URLs: `http://localhost:3000/auth/callback`;
   - для публікації: Site URL вашого production-домену та `https://YOUR_DOMAIN/auth/callback` у Redirect URLs.
4. Якщо Google OAuth працює в Testing mode, додайте потрібні облікові записи до Test users.

## Запуск і перевірка

У `shopik-app`:

```sh
npm install
npm run dev
```

Відкрийте `/`: без сесії має відбутися перехід на `/login`.
Увійдіть через Google: має відкритися «Мій простір» із роллю «Власник».
Оновіть сторінку й відкрийте другу вкладку: сесія збережена, Workspace один.
Вийдіть: `/` знову спрямовує на `/login`.
Другий Google-акаунт в окремому профілі браузера має отримати інший Workspace.
Відхилення OAuth має повертати на сторінку входу з повідомленням і можливістю повторити.

Автоматичні перевірки: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
`npm run test:supabase` перевіряє справжній проєкт із `.env.local`: Google Provider, наявність таблиць і RPC, заборону анонімного читання та створення Workspace. Не створює тестових користувачів і не виводить ключі чи рядки таблиць.
Після production build: `npm run test:smoke` запускає власний сервер на порту 3187, перевіряє захист головної сторінки, сторінку входу, відмову OAuth, некоректний код, заборону зовнішнього перенаправлення, пошкоджену та підроблену cookie сесії й зупиняє сервер. Потребує коректного `.env.local` і доступу до Supabase Auth для перевірки підробленого токена.
Для `npm test` потрібен Node.js із підтримкою запуску TypeScript (у робочому середовищі Node 24).

## Стан перевірки авторизації — 29.10.2026

Пройшли `lint`, `typecheck`, 4 тести конфігурації, production build через Webpack, розширені HTTP-тести та `test:supabase`.
Підтверджено: неавторизована, пошкоджена й підроблена сесії не відкривають Workspace; некоректний OAuth callback повертає на сторінку входу; зовнішнє перенаправлення відхиляється; відповіді мають `no-store`; реальний Supabase приймає публічний ключ і відхиляє анонімний доступ до даних та bootstrap RPC.

Користувач повідомив результат запуску `supabase/tests/auth_workspaces.sql`: `set_config: "{}"`, без повідомлення про помилку. За умови виконання всього файлу це означає проходження SQL-перевірок відсутності дублікатів, ізоляції двох користувачів і заборони зміни членства та анонімного bootstrap. Тест завершується `ROLLBACK`; агент самостійно SQL не запускав.

Користувач також підтвердив успішне виконання всіх кроків браузерного сценарію нижче: оновлення сторінки, друга вкладка, logout, захист другої вкладки після оновлення та повторний вхід.

Етап 1 прийнято на основі автоматичних перевірок і результатів, повідомлених користувачем. Автоматичне оновлення токена після закінчення його строку окремо не перевірялося.

Ручний сценарій для чинної сесії:
1. Відкрити `/`, оновити сторінку та відкрити її у другій вкладці: простір залишається доступним.
2. Натиснути «Вийти»: відкривається `/login`; перехід на `/` і оновлення другої вкладки також повертають на `/login`.
3. Увійти через той самий Google-акаунт: відкривається попередній Workspace, а не новий.

Помилка `relation "profiles" already exists` не є очікуваним результатом тесту: тестовий файл не створює таблиць. Перевірте, що запускається `supabase/tests/auth_workspaces.sql`, а не міграція. Якщо файл правильний, потрібен повний SQL `CONTEXT` для перевірки тригерів.

## Межі цього етапу

Теги (задача 005): застосувати лише нову міграцію `supabase/migrations/202610290005_tags.sql`, потім виконати весь `supabase/tests/tags.sql`. Очікуваний результат: `PASS: tags, atomic save, AND filters, expense totals and RLS`. Наявні продукти й витрати зберігаються. `test:supabase` та `test:smoke` включають таблиці, RPC і сторінку тегів.

Підключені Google Login, cookie-сесії, logout та особистий Workspace.
Продукти перенесені в окремий етап: `docs/tasks/003-products.md`. Для них застосовується міграція `202610290002_products.sql`; JSON видалений без імпорту старих записів.

Категорії та витрати: `docs/tasks/004-categories.md`. Послідовно виконати лише нові міграції `202610290003_categories.sql`, потім `202610290004_expenses.sql`. Після цього запустити весь `supabase/tests/categories_expenses.sql`; очікується `PASS: categories, expense lifecycle, Kyiv months and RLS`. Старі міграції не повторювати. `test:supabase` тепер також перевіряє categories, expenses та заборону анонімного виклику місячної статистики.
Запрошення, перемикання Workspace та редагування ролей — наступні етапи.
Паролі не отримуються й не зберігаються Shopik: використовується тільки Google OAuth.

Офіційні джерела:
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

## Етапи 008–009 — нова міграція

Після 007 виконати лише supabase/migrations/202610300008_optimistic_queries.sql. Вона ще не застосована до робочої бази. Не додавати shopik_private до exposed schemas. Потім у тестовому проєкті виконати весь supabase/tests/optimistic_queries.sql (rollback), а в shopik-app — npm run test:supabase -- --optimistic. Перезапустити застосунок або розгорнути нову збірку. Без нових RPC збереження не переходить на старий неідемпотентний шлях. Звіт та обмеження перевірок: docs/testing/008-009/README.md.
