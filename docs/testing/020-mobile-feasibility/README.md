# 020 — початок реалізації Android

Дата: 05.11.2026. Гілка: `feat/android-offline-restart`.

Створено ізольований прототип `shopik-mobile/`. Обсяг — початкова технічна перевірка 020,
не завершення всього Android-плану. iOS не реалізується. Browser offline не додається.

## Результати

| Перевірка | Стан |
| --- | --- |
| Веб: `npm test` | PASS, 45/45; наявне попередження MODULE_TYPELESS_PACKAGE_JSON |
| Веб: `npm run lint` | PASS |
| Веб: `npm run typecheck` | PASS |
| Веб: `npm run build` | PASS, маршрути SSR/Proxy збережено |
| Мобільний: Node-тести IndexedDB | PASS: reopen, rollback, scope isolation, inconsistent payload, future schema |
| Мобільний: strict TypeScript | PASS |
| Мобільний: Vite production build | PASS, локальні assets у `shopik-mobile/dist` |
| Перевірка local boot/runtime boundary | PASS |
| Capacitor add/sync Android | PASS, локальні assets скопійовано, App plugin підключено |
| Gradle assembleDebug | BLOCKED: немає JAVA_HOME/java |
| Реальний Android, cold start, force stop/reboot/update, quota | NOT RUN |
| Справжній Google OAuth / повернення / Keystore | NOT RUN, реалізація 023 ще не почата |
| Стан hosted Supabase migrations/RLS | NOT VERIFIED; підключення й зміни не виконувалися |

Мобільний прототип використовує тестові дані й окрему БД. Дані й намір зберігаються в одній
транзакції; помилка пізнього add відкочує попередній put. Повторне відкриття повертає той самий
operation ID. Перевірено `fake-indexeddb`, не Android/WebView; апаратне приймання залишається відкритим.

Версії, вимоги SDK/JDK, команди й ручний сценарій: [shopik-mobile/README](../../../shopik-mobile/README.md).

## Наступні кроки й невирішені рішення

- Пройти апаратні перевірки 020 після встановлення toolchain; IndexedDB поки кандидат, не підтверджене production-рішення.
- Визначити production application ID, домен інвайтів і точний OAuth callback/allowlist.
- Обрати й перевірити Android Keystore-адаптер credentials. Тимчасова сесія в localStorage/Preferences не додається.
- Визначити правила доступності приватного офлайн-кешу й валідації часу покупки. Pending-операції не видаляються за TTL.
- Після gate 020 продовжити 021–029 за залежностями; основний UI не переносити масово до підтвердження платформи.

Паролів Shopik не додано: Google/Supabase залишається способом входу. Постійні ID продуктів
генеруватимуться сервером як SHA256; `local:…` є окремим тимчасовим ключем.
