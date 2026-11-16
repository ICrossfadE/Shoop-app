# 023 — Google OAuth, повернення в APK та мобільна сесія

Статус: код і автоматичні перевірки реалізовано 05.11.2026; зовнішня конфігурація та приймання на Android відкриті. Пріоритет: P0. Залежності: [020](020-mobile-feasibility.md), [022](022-capacitor-mobile-shell.md).
Батьківський план: [Android plan](../MOBILE_ANDROID_PLAN.md).

## Мета

Вхід у той самий Supabase-акаунт із Google без залежності від cookie вебверсії та без передачі credentials у бізнес-чергу.

## Роботи

- Реалізувати Supabase mobile client і PKCE з відкриттям Google у системному браузері. Вибраний callback allowlist, app/deep links та стан очікуваного входу перевіряти явно.
- Обробити callback як у вже запущеному, так і в закритому застосунку. Перевіряти схему/host/path, поточну PKCE-спробу, повторний callback і скасування входу; не підтримувати довільні redirects.
- Зберігати сесію через обраний у 020 підтримуваний Keystore/Keychain-адаптер; не використовувати звичайні Preferences або outbox для токенів. Перевірити Android backup/logging.
- Розділити відсутність мережі, потребу refresh/повторного входу та підтверджене відкликання доступу. Офлайн не трактувати як logout і не стирати чергу при простому expiry access token.
- Онлайн підтверджувати користувача та актуальне членство. Після завершення auth відновлювати синхронізацію лише його scope.
- Документувати точні зміни Google/Supabase allowlist і канонічний домен без широких production wildcards. Парольний вхід не додавати.

## Критерії готовності

- Справжній Google-вхід повертає в APK і відкриває попередній простір/акаунт без створення дубля.
- Повторний запуск, refresh, скасування, помилковий/повторний callback і зміна Google-акаунта мають визначену поведінку.
- Сесії, одноразові коди й invite secrets не потрапляють у логи, query cache або чергу операцій.
- Вебcallback і поточний SSR-вхід збережені. Повний UX виходу з невідправленими змінами інтегрується у 028.

## Перевірки

Auth/deep-link unit та інтеграційні перевірки; на фізичному Android — холодний/теплий callback, cancel, process death під час OAuth, refresh і повторний вхід. Макет OAuth не є доказом реального входу. Звіт: `docs/testing/023-mobile-auth/`.

## Результат реалізації

[Звіт 023](../testing/023-mobile-auth/README.md): Android Google PKCE/системний браузер, Keystore session adapter, cold/warm callback, cancel/replay захист та scope gate. Mobile 27/27 і web 45/45 тестів, lint/typecheck/build, Android sync — PASS. Реальний Google OAuth, device/Keystore та APK не підтверджено: Gradle заблокований відсутнім JDK. Синхронізація та відновлення попереднього простору залежать від 024–028.
