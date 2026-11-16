# 021 — спільне ядро й платформні контракти

Реалізовано в `feat/android-offline-restart`. Апаратне приймання 020 залишається відкритим;
за наступною вказівкою користувача продовжено незалежну від Android toolchain частину 021–022.

## Реалізація

- `shopik-app/lib/domain/index.ts` повторно використовує існуючі канонічні модулі без копій.
- OR-фільтрацію/list data відокремлено від вебчернеток з `HTMLElement`.
  `lib/list-model.ts` зберігає сумісність старих вебімпортів і типів фокусу.
- Введено інтерфейси auth/read/write/navigation/storage/lifecycle/theme/invitation links.
  Production auth/data транспорт ще не реалізований: це наступні задачі 023–026.
- Палітру винесено в єдиний CSS-файл. Підстановкою його вмісту назад у `globals.css`
  підтверджено повну тотожність з HEAD після нормалізації CRLF/LF. Значення й порядок правил збережено.
- Типи БД та bootstrap використовують чисту list model; Supabase/Next runtime до мобільного клієнта не імпортуються.
- Немає нових npm-залежностей, workspace-фреймворку, Server Actions у мобільному runtime.

## Матриця компонентів

| Частина | Рішення | Стан |
| --- | --- | --- |
| products/money/tags/categories/expenses/identity/shopping/theme/workspace-name | Спільні канонічні TypeScript-функції й типи | Підключено через domain entry |
| list-model, database types, workspace boot | Чисті спільні дані; DOM-чернетки залишаються у вебі | Відокремлено й перевірено |
| ThemePicker/ThemeProvider | Спільні валідатор і палітри; окремий Android theme adapter | Підключено локальні шість тем |
| WorkspaceApp/AppHeader/ScreenLink | Окрема мобільна оболонка та navigation/lifecycle adapters | Реалізовано 022; SSR/cookie вебу збережено |
| OrderCard/TagBadge/Avatar/AnimatedNumber | Повторне використання presentation після відокремлення web aliases/icons | Перенесення в 027, мобільна збірка їх не імпортує |
| OrderModal/CreateAction/CategoryManager/TagManager | Потрібна ін'єкція read/write transport замість Server Actions | Контракти готові, адаптація UI в 027 |
| ProductList/ExpenseList/ExpenseChart | Спільні моделі/суми, окремий repository/query adapter | Інтеграція 024/026/027 попереду |
| GoogleSignIn/SignOutButton | Android auth/Keystore adapter | 023; вебcallback не змінено |
| WorkspaceSwitcher/JoinWorkspace/WorkspaceInvites/Members | Онлайн workspace adapter і канонічні HTTPS-посилання | 028; без змін у вебі |

Повний перенос UI ще не завершено; документ не позначає основні бізнес-екрани готовими.

## Перевірки

- `npm run typecheck:domain`: PASS без DOM-елементів, React/Next/Node types.
- Мобільні тести: 13/13 PASS, включаючи однакові функції для вебу й Android,
  OR, quantity, plan/actual, розрізнення SHA256/UUID/local IDs.
- Мобільні lint, typecheck, production build, guard локальних assets/runtime boundary: PASS.
- Веб: 45/45 тестів, lint, typecheck, production build: PASS. SSR/Proxy маршрути збережено.
- Міграції, RLS, живий OAuth, робочі Supabase-сервіси не змінювалися й не перевірялися.
- Browser/Android visual QA не виконувався; незмінність CSS підтверджена тотожністю вихідних правил.

Прочитано встановлені Next.js guides `package-bundling.md` та `02-typescript.md`,
а також встановлені TypeScript-визначення Capacitor App перед інтеграцією lifecycle.
