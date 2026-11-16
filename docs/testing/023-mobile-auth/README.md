# 023 — Google OAuth і мобільна сесія

Дата: 05.11.2026. Гілка: `feat/android-offline-restart`.
Статус: код та автоматичні перевірки реалізовані; приймання справжнього Google OAuth на Android **відкрите**.

## Реалізовано

- Окремий Supabase JS 2.119.0 client: Google PKCE, вибір акаунта, системний браузер через Capacitor Browser 8.0.5. Web cookie, автоматичне читання URL та SDK debug не використовуються.
- Secure Storage 8.0.1 від Aparajita: AES-GCM із ключами Android Keystore. Session, verifier, nonce/flow ID і мінімальна display identity відокремлені від IndexedDB/outbox. Credential adapter відхиляє всі виклики поза Android, щоб не використовувати незашифрований web fallback плагіна.
- Callback лише `ua.shopik.prototype://auth/callback`, Android intent filter з відповідними scheme/host/path. Немає довільного redirect/next. Відхиляються token fragments, чужі host/path/port, дубльовані/невідомі параметри, код без актуальної спроби.
- Nonce через crypto.randomUUID; спроба чинна 10 хвилин. Flow ID вибирає конкретний PKCE verifier у SDK. Pending записується перед відкриттям браузера. Холодний/теплий lifecycle використовують один handler. Серіалізація запобігає гонкам callback/cancel/logout. Callback споживає pending перед exchange; після помилки exchange або завершення процесу в цій точці потрібна нова спроба входу.
- Відмова Google споживає pending. Кнопка «Скасувати вхід» видаляє pending та блокує пізній callback. Саме повернення з браузера не скасовує спробу через можливу гонку resume/callback: закрийте браузер і скористайтеся кнопкою. Після 10 хвилин read/resume відкидає прострочену спробу. Старі verifier залишаються тільки у захищеному SDK storage і не обходять перевірку pending.
- Offline/помилка сервера, необхідність повторного входу та підтверджена онлайн-сесія мають різні стани. Локальна identity зі статусом needs-auth і verification=unavailable — контекст показу, а не дозвіл сервера. Відсутність мережі та refresh rejection не викликають logout і не стирають бізнес-чергу.
- getSession оновлює прострочений access token; getUser підтверджує користувача на сервері. Відкликаний refresh token переводить стан у needs-auth зі збереженням identity. verifyScope перевіряє user ID та workspace_members включно з membershipEpoch=created_at. Помилка запиту членства не видається за підтверджене виключення; інший акаунт/простір/епоха забороняє синхронізацію.
- UI входу, повторного входу/зміни Google-акаунта, cancel та виходу на пристрої. SignOut scope=local не очищує бізнес-сховище. SDK може потребувати мережі для revoke: відмова виходу показується без твердження про успіх. UX невідправлених змін — задача 028.

Продуктові дані ще не завантажуються, sync engine ще не створено. verifyScope — точка перевірки для 026, а не працююча синхронізація. Парольний вхід не додано; ID продуктів не змінено. iOS не створювався і не змінювався. Вебкод цього етапу не змінювався.

## Точне зовнішнє налаштування

1. Використовується **той самий Supabase project**, що у вебі. До ігнорованого `shopik-mobile/.env.local` перенесено лише наявні NEXT_PUBLIC_SUPABASE_URL і public publishable/anon key без виведення значень. На іншій машині скопіювати `.env.example` та вказати VITE_SUPABASE_URL і VITE_SUPABASE_PUBLISHABLE_KEY. Service-role/secret key заборонений. Після зміни env потрібні нові build та Android sync.
2. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs: **додати**, зберігаючи чинні web entries, вузький prototype pattern; зворотний слеш екранує літеральний знак питання:

```text
ua.shopik.prototype://auth/callback\?attempt=*
```

Scheme/host/path фіксовані; wildcard потрібний тільки для випадкового UUID у query. Не додавати `**`, загальний `https://**` або wildcard production-домен. SDK appendPkceFlowIdToRedirects не увімкнено: flow ID передається через захищений pending. Якщо сервіс відхиляє pattern чи повертає на Site URL, перевірити literal escaping через тест pattern у документації; не розширювати allowlist.

3. Зберегти production Site URL вебу. Не підміняти його Android scheme. Канонічний домен production APK ще не визначений; DNS та assetlinks не налаштовані.
4. Google Cloud → чинний OAuth Web client Supabase provider: зберегти authorized redirect URI `https://<ВАШ_SUPABASE_PROJECT>/auth/v1/callback` або наявний callback custom Auth domain. Android scheme не додається до Google redirect URI: Google повертається у Supabase, Supabase — у застосунок. Якщо Google provider уже працює у вебі з цим project, новий Google OAuth client для цього browser flow не потрібний.
5. Налаштування Dashboard/Google **не застосовувались і не перевірялись живим OAuth**. Перед release визначити остаточний application ID/callback. Prototype custom scheme не доводить ownership домену. Для verified HTTPS Android App Links потрібні власний домен, assetlinks.json із SHA256 fingerprint сертифіката підпису та узгоджені manifest/parser/allowlist. Це відкрита release-конфігурація.

## Безпека та практичні межі

Manifest: allowBackup=false, usesCleartextTraffic=false; WebView debug вимкнено. У native source плагіна немає Log.* викликів. Доданий TypeScript не журналює URL, code, токени або винятки SDK; UI має фіксовані повідомлення. Це перевірка коду, а не forensic-аудит APK. Плагін записує зашифровані дані через SharedPreferences.apply: Promise не є доказом fsync при раптовому вимкненні живлення. Втрата session/pending потребує нового входу; бізнес-outbox цим сховищем не обслуговується. Backup/OEM device transfer і Keystore invalidation потрібно перевірити на пристрої. Повне шифрування IndexedDB тут не заявляється.

## Автоматичні перевірки

- Mobile: **27/27** тестів; lint без попереджень; domain typecheck та TypeScript; Vite production build; guard локального bundle/runtime; Android sync із трьома Android-плагінами — PASS.
- 14 auth-тестів: allowlist/дублікати/fragment, cold/warm/double callback, cancel/denial, TTL/майбутній час/corrupt pending, write/browser/exchange failures, offline/401/400 refresh rejection/503, account/workspace/epoch gate, logout без очищення бізнес-даних, Android-only credential adapter, public config.
- Інтеграційний тест використовує **справжній встановлений Supabase SDK** із підставним HTTP: генерує PKCE verifier/challenge, відновлює інший instance, звіряє SHA256 challenge з verifier у token request, викликає getUser і workspace_members. Це не справжній Google-вхід та не доказ роботи Keystore.
- Web: **45/45** тестів, lint, TypeScript і production Next build — PASS. SSR/Proxy маршрути збережено; візуальний прогін не виконувався.
- Node MODULE_TYPELESS_PACKAGE_JSON — наявне попередження імпорту TypeScript вебядра; web package type заради нього не змінено.
- Gradle assembleDebug — **BLOCKED**: JAVA_HOME is not set and no java command could be found in PATH. APK не створено. [Вимоги та команди APK](../../../shopik-mobile/README.md).

## Ще обов’язково на Android

Після налаштування allowlist на фізичному пристрої: реальний Google-вхід до того самого account ID, cold/warm callback, cancel, kill/process death до callback та під час exchange, refresh після expiry, revoked refresh, offline/reconnect, зміна Google-акаунта, неправильний/повторний callback, відмова Keystore, backup/restore, перевірка логів на credentials. Повернення попереднього простору та синхронізація перевіряються після 024–028. Ці пункти **не виконано**, 023 не позначено остаточно прийнятою.

## Документація перед змінами

- [Capacitor Browser v8](https://capacitorjs.com/docs/apis/browser)
- [Secure Storage: Capacitor 8, Android AES-GCM/Keystore та web fallback](https://github.com/aparajita/capacitor-secure-storage)
- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase redirect allowlist та glob escaping](https://supabase.com/docs/guides/auth/redirect-urls)
- Встановлені declarations/source SDK: signInWithOAuth, flowId, exchangeCodeForSession; SecureStorage native implementation та Browser API.

## Продовження під час 024

JDK 21 і Android SDK 36 встановлено; Gradle debug build тепер проходить, APK створено. Попередній toolchain-блокер знято. [Актуальний файл і результати](../024-local-repository/README.md). Це не закриває реальний Google OAuth/Keystore acceptance: фізичний Android не підключений, hosted callback allowlist не змінювався.
