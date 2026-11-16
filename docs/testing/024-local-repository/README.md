# 024 — Локальний репозиторій та outbox

Дата: 05.11.2026. Гілка: `feat/android-offline-restart`.
Статус: код, автоматичні перевірки й debug APK готові; апаратне приймання Android відкрите.

## Результат

- Окремий IndexedDB `shopik-android-local`, schema v2, версіоновані транзакційні міграції. Прототип 020 лишився в окремій БД; його тестові записи не видаються за дані акаунта.
- Нормалізовані confirmed entities та локальна projection: товари, категорії, теги, product-tag зв’язки, витрати, ознаки bootstrap і завантажених місяців. Спільні TypeScript-моделі використовуються без змін вебядра.
- Scope включає account/workspace/membership epoch. Draft, ID mapping, порядок і всі операції ізольовані за цим scope. Вхідні параметри копіюються до першого await, включно зі scope.
- Категорія create/rename/delete, тег create/delete, товар save/delete/complete до 500 за дію, корекція суми витрати. Спільні валідатори цін/кількості/назв; план витрати й історичні категорія/теги зберігаються. Локальна перевірка автора не є серверним дозволом.
- accept змінює projection і додає outbox intent однією strict-durability транзакцією. Успіх лише після complete. Duplicate ID, quota/abort або помилка валідації не залишають окремої optimistic-картки чи використаного sequence.
- Outbox: operation ID, локальні ключі/refs, залежності, base revision, час дії, command version, pending/sending/needs-auth/conflict/rejected/acknowledged, кількість спроб, frozen wire payload та acknowledgement revision. TTL немає. Sending після повторного відкриття не стає новою операцією.
- Перед першим відправленням лише типізовані refs перетворюються в серверні ID. Нові сутності зберігають explicit local client key до відповіді. Постійні product ID перевіряються як SHA256, інші server ID — UUID. Текстові поля не переписуються.
- Відповідь, mappings, confirmed graph, acknowledgement і pending projection застосовуються атомарно. Неповна/чужа mapping або неможливий replay скасовують усю транзакцію. Повтор того самого підтвердження ідемпотентний.
- Завислий sending повторюється з тим самим ID та незмінним wire JSON. Conflict/rejected зберігаються для майбутнього явного вирішення, автоматичного обнулення чи переписування payload немає.
- Окремі disposable snapshots не містять outbox. clearSnapshots не видаляє нормалізовані сутності, чергу, mappings або drafts. Невідомий місяць, завантажений порожній місяць і локальна витрата без повного місяця розрізняються.
- У налаштуваннях є окрема діагностика 024: явно тестовий scope, створення offline-ланцюжка й перечитування. Жодні тестові дії не надсилаються в Supabase.

Схема, API й обмеження описані у [repository README](../../../shopik-mobile/src/repository/README.md). Ревізії/wire envelope тут є внутрішньою межею для 025/026, а не вже розгорнутим серверним RPC. Реальної синхронізації та бізнес-екранів покупок ще немає; вони належать 025–028. Credentials зберігаються тільки адаптером 023; повне шифрування IndexedDB не заявляється. iOS і вебкод не змінювались, нові npm-бібліотеки не встановлювались.

## Перевірки

- Mobile Node: **44/44** — PASS, з них **17** нових репозиторних сценаріїв. Відновлення offline-ланцюжка, залежності/sequence, копіювання аргументів, rollback duplicate/quota/abort, scope isolation, drafts/snapshots, unloaded/empty/pending month, Kyiv-межа місяця, mappings/ack, frozen retry, auth/conflict states, історичні дані, міграція v1→v2, відхилення unsafe legacy sending та future formats.
- **Реальний IndexedDB** у headless Edge: два окремі процеси з одним тимчасовим дисковим профілем — PASS. Перший процес записав ланцюжок, перевірив abort і справжню versionchange-міграцію. Другий відновив sending/graph/draft з диска, повторив незмінний payload, застосував canonical mappings/receipts та перевірив очищення лише filter snapshots. Профіль видалено після тесту. Це тест ізольованого fixture, а не зміна вебзастосунку чи реалізація його offline-режиму.
- Mobile lint, domain typecheck, TypeScript, Vite build, bundle guard, Capacitor Android sync — PASS.
- Web: **45/45**, lint, TypeScript, production Next build — PASS. Візуальний прогін не виконувався; поточні SSR/Proxy маршрути збережені.
- `npm run android:debug`: Gradle assembleDebug — **BUILD SUCCESSFUL**. Компіляція Android-плагінів Keystore/Browser/App пройшла; це ще не тест їх виконання на телефоні.
- apksigner verify — PASS, APK Signature Scheme v2, сертифікат Android Debug. aapt підтвердив app ID `ua.shopik.prototype`, minSdk 24, target/compile SDK 36, versionName 0.1.0 / versionCode 1.
- Наявне Node MODULE_TYPELESS_PACKAGE_JSON і попередження Gradle flatDir не блокують збірку. Перший Gradle запуск попередив про XML v4 у свіжих tools та додатково встановив Build Tools 35; Android SDK 36 і Build Tools 36 також встановлені.

## Готовий файл

[app-debug.apk](../../../shopik-mobile/android/app/build/outputs/apk/debug/app-debug.apk)

Розмір: **4 393 025 байтів**. SHA256:

```text
7363fc4facbb7e8910818f7a8180769f0c0b47a8c994004ef0ef2030ad4076d1
```

Це тестова Android-оболонка з діагностикою, не production release і не повний offline-продукт. Production signing, фінальний application ID та приймання — 029. Встановлення: `adb install -r shopik-mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

## Встановлені інструменти

Встановлено без адміністратора у `%LOCALAPPDATA%/ShopikToolchain`:

- Eclipse Temurin **JDK 21.0.13+9** (Windows x64), офіційний Adoptium download, SHA256 архіву звірено з Adoptium API.
- Android Command-line Tools **23.0.0** з Google repository; checksum архіву звірено з офіційним XML. Свіжий sdkmanager є wrapper нового Android CLI; для пакетів використано `android --no-metrics --sdk=<SDK> sdk install platforms/android-36@2.0.0` та `build-tools/36.0.0`.
- Platform **android-36 revision 2**, Build Tools **36.0.0** і **35.0.0** (35 встановив AGP), Platform Tools **37.0.1**; Gradle Wrapper **8.14.3** завантажив свою distribution.
- User JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT і user PATH налаштовані. Ігнорований `android/local.properties` указує на встановлений SDK. Новому терміналу/процесу потрібне оновлене середовище; для поточного PowerShell є команди у [mobile README](../../../shopik-mobile/README.md).
- Android Studio та емулятор не встановлювалися: для CLI debug build вони не потрібні. `adb devices` не показав підключених пристроїв.

## Відкрите апаратне приймання

На телефоні: налаштувати callback за [023](../023-mobile-auth/README.md), увійти через Google, перевірити cold/warm callback і Keystore. Для 024 відкрити «Налаштування → Репозиторій та outbox · етап 024», створити тестовий ланцюжок, force stop → запуск, reboot → запуск та APK update тим самим підписом: граф і ті самі ID чотирьох операцій повинні зберегтися. Перевірити реальну відмову диска/квоти й переривання до/після commit. **Не виконано**: фізичного пристрою немає. Graceful Chromium process restart та симуляція quota не видаються за Android power-loss/force-stop/reboot/update тест.

## Джерела

Перед змінами прочитано задачу 024, поточні доменні моделі й IndexedDB-прототип, [IDBTransaction commit](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/commit), [Android SDK tools](https://developer.android.com/tools/sdkmanager), [Android JDK](https://developer.android.com/build/jdks), офіційні metadata Adoptium/Google repository. Новий синтаксис Android CLI перевірено через встановлені sdk/install/list help.
