# Shopik Android — оболонка, авторизація та локальний репозиторій 020–024

Реалізацію розпочато 05.11.2026 в `feat/android-offline-restart`.
Це технічний прототип і локальна оболонка, **ще не готовий застосунок покупок**.
У вебі відокремлено чисту list model від DOM-чернеток і винесено незмінні палітри у спільний CSS.
Чинні вебімпорти, компоненти, SSR/cookie поведінка, конфігурація, залежності й lockfile збережені.
Повний офлайн у браузері не реалізується. iOS виключено з робіт.

## Уже реалізовано

- Окремий React/TypeScript entry, Vite та Android-проєкт Capacitor з Gradle Wrapper.
- Локальні HTML, JS, CSS, системні шрифти; немає `server.url` або залежності від запущеного Next/Vite у встановленому APK.
- Перший екран пояснює необхідність онлайн-входу; немає підставного авторизованого списку.
- Окремий тест IndexedDB: категорія, тег, товар та тестова операція записуються атомарно. Успіх — лише після `transaction.complete`. Для pending-операцій немає TTL.
- Повторне читання, явне підтвердження очищення, native dialog/popover, Android Back і повернення з фону.
- Окрема БД `shopik-android-feasibility`; ключі `local:…` відокремлені від постійних серверних SHA256 ID продуктів.
- Спільне ядро `shopik-app/lib/domain`, контракти платформних адаптерів; без копіювання моделей і без Server Actions/Next/Node у мобільному runtime.
- Три розділи: покупки, витрати й налаштування; безпечне відновлення маршруту, локальний Back/history, error boundary.
- Шість тем зі спільної вебпалітри, локальне збереження вибору й обробка відмови сховища.
- Warm/cold URL events і resume/pause lifecycle; Google PKCE через системний браузер, Keystore session adapter, строгий prototype callback і блок акаунта. Hosted allowlist і реальний device OAuth ще потребують перевірки.

Код Google-входу та захищеного сховища реалізовано в 023; апаратне приймання відкрите.
Локальний репозиторій/outbox 024 реалізовано; серверний протокол, синхронізація, бізнес-UI/дії, простори та інвайти залишаються задачами 025–028.
У `src/repository/` є confirmed/projection, drafts, mappings, версіоновані міграції та атомарний outbox. У налаштуваннях доступна окрема діагностика 024. Тестові операції не надсилаються в Supabase; реальну синхронізацію ще не підключено.

## Локальні команди

Потрібен Node.js >=22.12; перевірено на 24.14.0 / npm 11.9.0.

```powershell
cd shopik-mobile
npm ci
npm run check
npm run lint
npm run android:sync
```

`check` запускає тести, строгий TypeScript, Vite build і перевірку local assets/runtime boundary.
`typecheck:domain` окремо перевіряє спільну модель без DOM-елементів/Next/React.
Для `lint` потрібне встановлене `../shopik-app/node_modules`: використовується наявний ESLint/React/TypeScript інструментарій вебу без нових залежностей.
Результат: `dist/` — ресурси для APK, а не сам APK.
`npm run dev` призначений лише для локальної розробки, без додавання офлайн-режиму вебсайту.

## Що потрібно для APK на Windows

1. JDK **21** та Android command-line tools. Android Studio **2025.2.1 або новіша** потрібна лише для роботи через IDE; для CLI build її можна не встановлювати.
2. Через SDK Manager: Android SDK Platform **36**, відповідні Build Tools, Platform Tools; для емулятора — system image і Android Emulator. Прийняти SDK licenses.
3. `JAVA_HOME` має вказувати на JDK; `ANDROID_HOME` — на SDK. Альтернатива для SDK — ігнорований Git файл `android/local.properties` з `sdk.dir=C:/Users/<user>/AppData/Local/Android/Sdk`.
4. Виконати `npm run android:debug`.

Очікуваний файл: `android/app/build/outputs/apk/debug/app-debug.apk`.
Встановлення: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
Також можна відкрити проєкт через `npm run android:open` і зібрати в Android Studio.

На цій машині **встановлено JDK 21.0.13+9 і Android SDK 36** у `%LOCALAPPDATA%/ShopikToolchain` без адміністратора. Build Tools 36.0.0 та Platform Tools 37.0.1 встановлені; AGP додатково завантажив Build Tools 35.0.0. Android Studio/емулятор не встановлювалися. User JAVA_HOME/ANDROID_HOME/ANDROID_SDK_ROOT та PATH налаштовані; `android/local.properties` збережено поза Git.

**Debug APK уже зібрано**: [app-debug.apk](android/app/build/outputs/apk/debug/app-debug.apk), близько 4.2 MiB. Підпис Android Debug перевірений apksigner. [SHA256 і повний звіт 024](../docs/testing/024-local-repository/README.md).

Новий термінал повинен отримати user environment. У вже відкритому PowerShell перед збіркою можна завантажити змінні явно:

```powershell
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
npm run android:debug
```

У свіжих Android Tools використовується `android --no-metrics sdk install`; назви пакетів мають формат `platforms/android-36@2.0.0`, `build-tools/36.0.0`. Старий sdkmanager є wrapper; не покладатися на його код завершення без перевірки встановлених файлів.

Параметри прототипу: `applicationId=ua.shopik.prototype`, versionName 0.1.0 / versionCode 1,
minSdk 24, compile/target SDK 36, AGP 8.13.0, Gradle 8.14.3, WebView **114+**.
WebView 114 обрано через popover — це суворіше за мінімум Capacitor.
Production app ID слід визначити до першого production APK. Прототип має окремий ID для ізоляції даних.
Backup, cleartext і WebView debugging вимкнено.

## Release APK після завершення плану

`npm run android:release` збирає **непідписаний** APK, доки signing не налаштовано.
Для підписаного APK в Android Studio: Build → Generate Signed App Bundle or APK → APK,
створити/вибрати власний keystore й зберігати його та паролі поза Git.
Для оновлень використовувати той самий application ID і ключ та збільшувати versionCode.
Release keystore й паролі не генерувалися; Gradle створив стандартний локальний debug key для тестової збірки. Підписаний прототип також не є готовим продуктом:
спершу потрібні задачі 021–029 та приймання на телефоні.

## Обов'язкове приймання прототипу на Android

1. Встановити APK; вимкнути Next/Vite і мережу; перевірити перший запуск.
2. Відкрити «Налаштування» → «Перевірка локального збереження», записати тест: повинні з'явитися тестові сутності й одна операція.
3. Force stop → запуск; reboot → запуск. Дані повинні відновитися.
4. Оновити APK через `adb install -r` тим самим підписом. Дані й черга повинні залишитися.
5. Перевірити dialog/popover, Back, поворот, safe areas, системні панелі та WebView 114+.
6. Перевірити відмову диска/квоти: помилкове повідомлення про успіх не допускається.
7. Перевірити три розділи й шість тем; після перезапуску повинні відновитися останній екран і тема. Back має закривати верхній dialog/popover перед навігацією.

Node-тести з `fake-indexeddb` перевіряють транзакційні сценарії, але не доводять стійкості
Android після kill/reboot/update або поведінки реального диска. Ці перевірки ще не виконані.

## Залежності та документація

Точні версії: Capacitor core/CLI/Android 8.6.0, App 8.1.2, React/React DOM 19.2.8,
Vite 8.3.6, TypeScript 5.9.3. App потрібен для Back/resume, Vite — для пакування.
`fake-indexeddb` 6.2.7 — лише devDependency для тестів транзакцій, до APK не входить.
Для 023 додано лише Supabase JS 2.119.0, Capacitor Browser 8.0.5 та Secure Storage 8.0.1. Ionic, router, SQLite та service worker не встановлювалися.

Прочитано перед змінами: [Capacitor setup](https://capacitorjs.com/docs/getting-started),
[Android environment](https://capacitorjs.com/docs/getting-started/environment-setup),
[Android](https://capacitorjs.com/docs/android), [config](https://capacitorjs.com/docs/config),
[Supabase native auth](https://supabase.com/docs/guides/auth/native-mobile-deep-linking),
[Vite](https://vite.dev/guide/), [IndexedDB commit](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event).

## Налаштування Google-входу (023)

Публічні env ключі, точний Supabase callback pattern, Google redirect URI, поведінка cancel/expiry та перелік device-тестів наведені у [звіті 023](../docs/testing/023-mobile-auth/README.md). На цій машині наявні public Supabase налаштування вебу перенесено в ігнорований `.env.local`. На іншій машині використайте `.env.example`; після зміни env повторіть `npm run android:sync`. Авторизація доступна лише на Android; у browser dev вона заблокована. Вебклієнт та його OAuth callback залишаються окремими.

## Перевірки репозиторію 024

`npm test` перевіряє транзакції/міграції/стани у fake-indexeddb. `npm run test:indexeddb` додатково перевіряє справжній IndexedDB у headless Edge/Chrome: два окремі процеси з одним тимчасовим дисковим профілем, commit/abort, міграція, frozen sending, mappings та очищення filter cache. Потрібен встановлений Edge/Chrome або `SHOPIK_TEST_BROWSER`; нових бібліотек не потрібно. Нормальний вебзастосунок тест не відкриває.

На телефоні: «Налаштування → Репозиторій та outbox · етап 024» → створити тестовий ланцюжок → force stop/reboot/update → перечитати. Scope явно діагностичний, не прив’язаний до Google-акаунта, без синхронізації. Фізичний Android поки не підключений; ці сценарії не видаються за пройдені.
