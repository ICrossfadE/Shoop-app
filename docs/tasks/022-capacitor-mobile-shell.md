# 022 — React/Vite/Capacitor: локальна Android-оболонка

Статус: Код оболонки реалізовано; APK і приймання пристрою очікують JDK/SDK. Пріоритет: P0. Залежності: [021](021-shared-mobile-contracts.md).
Батьківський план: [Android plan](../MOBILE_ANDROID_PLAN.md).

[Реалізація та перевірки](../testing/022-mobile-shell/README.md). Google-вхід, приватні дані й основні бізнес-дії ще не підключені.

## Мета

Отримати Android debug APK, який відкриває локальний інтерфейс без Next.js/Vercel та не потребує мережі для завантаження assets.

## Роботи

- Створити окремий TypeScript React/Vite entry і `capacitor.config.ts`; додати Android-проєкт та зафіксовані в 020 сумісні версії.
- До APK включати `index.html`, JS, CSS, шрифти, іконки та offline/start/error екрани. Production `webDir` — локальна збірка; `server.url`, cleartext і dev host у release відсутні.
- Перенести палітру й базову оболонку; додати платформну маршрутизацію трьох екранів, безпечне відновлення route й Android Back.
- Передбачити інтерфейси cold start, повернення з фону та відкриття посилань. Зараз реалізувати базовий lifecycle, інтеграцію з чергою завершити в 028.
- Зафіксувати команди build → Capacitor sync → Gradle debug і налаштування SDK. Не змінювати вебпроєкт на статичний Next export.
- Додати лише Capacitor core/CLI/Android і потрібний bundler; додаткові плагіни підключати у задачах, які їх використовують.

## Критерії готовності

- APK встановлюється й відкривається з режимом польоту, навіть якщо Next/Vite dev servers вимкнені.
- Перший запуск без акаунта показує зрозумілу потребу онлайн-входу, а не хибний порожній список.
- Немає зовнішнього завантаження основних шрифтів/стилів/скриптів та серверних imports.
- App ID й origins стабільні, бо їх зміна може втратити доступ до локальних даних.

## Перевірки

Мобільні lint/typecheck/build, Gradle debug build, установка й cold start на емуляторі та фізичному Android. Перевірити Back, landscape, safe area, status/navigation bars. Звіт: `docs/testing/022-mobile-shell/`.
