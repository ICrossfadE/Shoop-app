# 022 — локальна Android-оболонка

Статус: код оболонки реалізовано; приймання APK/пристрою очікує Android toolchain.

## Реалізовано

- Три екрани: покупки, витрати, налаштування. До входу показується явний first-run стан,
  а незавантажені місяці не видаються за нуль витрат. Бізнес-дані ще не підключені.
- Allowlist маршрутів, відновлення останнього екрана з версіонованого налаштування,
  обмежена історія та Android Back: закрити dialog/popover → повернутися → вийти з кореня.
- Пошкоджений/невідомий маршрут скидається до покупок. Сирі URL, токени й приватні дані
  не записуються в route preferences. Навігація працює і при відмові сховища.
- Шість тем зі спільної вебпалітри; вибір зберігається локально. Відмова запису явно показується.
- Lifecycle adapter: warm/cold URL events, resume/pause, очищення listeners,
  усунення дубльованого URL під час запуску. У shell приймаються тільки локальні allowlisted routes;
  реальні OAuth/invite app links залишаються 023/028, manifest під них ще не налаштовано.
- При resume оновлюються мережевий стан і тестовий repository; помилка мережі не очищує дані.
- Локальний React error boundary, системні шрифти, safe-area CSS, layout для малих екранів.
- Тестова база 020 збережена; діагностику перенесено до налаштувань.

## Перевірки

- 13/13 Node-тестів PASS: persistence/rollback/isolation, route restore/Back,
  unsafe URLs, denied storage, шість тем, canonical invitation origin,
  lifecycle deduplication/cleanup/failure, shared domain parity.
- Мобільні lint, окремий domain typecheck, загальний typecheck, production build: PASS.
- `npm run android:sync`: PASS. HTML/JS/CSS копіюються в Android assets локально.
- APK/установка/force stop/reboot/update, реальні Back/rotation/safe areas/system bars/WebView: NOT RUN.
  Раніше підтверджено блокер: JAVA_HOME/java відсутні. SDK/Studio не знайдено у типових каталогах.
- Нових залежностей немає. ESLint використовує наявний інструментарій вебпроєкту,
  тому для `npm run lint` потрібне також `npm ci` у `shopik-app`.

Порядок після встановлення JDK 21 та SDK 36:

```powershell
cd shopik-mobile
npm run lint
npm run check
npm run android:debug
```

Результат клієнтської збірки — `shopik-mobile/dist/`, це ще не APK.
Команди й вимоги signing: [README](../../../shopik-mobile/README.md).

Сценарій приймання: запуск у режимі польоту без dev servers → перехід між трьома екранами →
вибір кожної теми → примусове закриття й повторний запуск → той самий екран/тема →
Back/dialog/popover → test save/reboot/update. Перевірити на мінімальному WebView 114+ і фізичному Android.
