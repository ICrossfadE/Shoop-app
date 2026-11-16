# Спільне ядро Shopik

`index.ts` — спільна TypeScript-межа для вебу й Android. Чисті моделі та валідатори
залишаються єдиними канонічними модулями `lib/`; їх не копіюють у мобільний клієнт.
Окремий npm package/workspaces не потрібний: тут немає runtime-залежностей.

`domain/list-model.ts` містить дані, OR-фільтрацію та перерахунок витрат.
`lib/list-model.ts` зберігає старий вебімпорт і додає лише DOM-чернетки з елементом
повернення фокусу. Типи bootstrap/БД посилаються на чистий модуль.

`platform.ts` задає інтерфейси auth, читання/запису, навігації, lifecycle, теми,
інвайт-посилань, scoped storage й окремого сховища credentials.
`WorkspaceWriter` — контракт UI-транспорту, не серверний протокол синхронізації:
ревізії, membership epochs, receipts та durable outbox реалізуються у 024–026.

`theme-palette.css` містить перенесені без зміни значень палітри вебверсії.
Веб і Android імпортують той самий файл. Веброзмітка й компоненти не переписувалися.

Перевірка: з `shopik-mobile` виконати `npm run typecheck:domain`.
Вона використовує ES2022/WebWorker та `types: []`: URL/Intl доступні,
але `HTMLElement`, `window`, `document`, React, Node і Next не потрібні.
Будь-які DOM-деталі належать до UI/платформних адаптерів.
