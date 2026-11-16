# 024 — Постійний локальний репозиторій та outbox

Статус: код, автоматичні перевірки й debug APK готові 05.11.2026; апаратне приймання Android відкрите. Пріоритет: P0. Залежності: [020](020-mobile-feasibility.md), [022](022-capacitor-mobile-shell.md).
Батьківський план: [Android plan](../MOBILE_ANDROID_PLAN.md). Пов'язана стара задача: [010](010-offline-sync.md).

## Мета

Зберігати достатню локальну модель для самостійного запуску й редагування товарів, категорій, тегів та витрат, а не тільки snapshots завантажених фільтрів.

## Роботи

- Реалізувати обраний адаптер даних із версіонованими міграціями. Початковий кандидат IndexedDB; SQLite — лише за висновком 020. Credentials зберігаються окремо.
- Моделювати confirmed entities, локальні зміни, категорії, теги, product-tag зв'язки, відомі місяці витрат, membership epoch, draft, ID mapping та outbox.
- Однією транзакцією приймати локальну дію: зміна видимого стану й стійкий запис наміру/залежностей. Показувати «збережено на пристрої» лише після commit. При quota/abort не удавати успіх.
- Зберігати local entity key, operation ID, account/workspace/epoch, порядок, тип, локальні refs, base revision, час дії, стан/спроби та незмінний payload після початку відправлення.
- Окремо зберігати стани pending/sending/needs-auth/conflict/rejected та підтвердження. Завислий sending після перезапуску не перетворювати на нову операцію.
- Забезпечити атомарне прийняття серверної відповіді разом зі зіставленням ID; залежні refs переводити в серверні ID до першого відправлення.
- Не застосовувати старий seven-day cache prune до outbox. Підтверджений стан, незавантажений період, порожній результат і pending projection мають різні ознаки.

## Критерії готовності

- Створені без мережі категорія → тег → товар → завершення переживають kill/reboot і міграцію сховища.
- Акаунти, простори й повторні членства ізольовані. Очищення snapshots не видаляє outbox.
- Відмова запису не залишає лише optimistic-картку без стійкої операції.
- Міграція даних після оновлення APK не втрачає чергу та дозволяє виявити несумісний формат.

## Перевірки

Транзакційні інтеграційні тести на реальному обраному сховищі: crash до/після commit, quota/abort, повторне відкриття, mapping, account isolation, upgrade. Android force stop/reboot/update. Звіт: `docs/testing/024-local-repository/`.

## Результат

[Звіт 024](../testing/024-local-repository/README.md): версіонований IndexedDB, confirmed/projection, атомарний outbox, frozen retry, mappings/ack, scope isolation і міграції. Mobile 44/44; реальний Chromium IndexedDB у двох процесах; web 45/45; lint/typecheck/build та debug APK — PASS. JDK 21/SDK 36 встановлено. Force stop/reboot/update, реальна quota та Google OAuth на фізичному Android не перевірялися.
