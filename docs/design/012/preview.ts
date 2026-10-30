// Standalone design review only: typed sample data, no network or persistent changes.
type TagKey = 'weekly' | 'breakfast' | 'home' | 'sale' | 'family';
type DemoProduct = { name: string; description: string; price: number; category: string; tags: TagKey[]; author: 'Олексій' | 'Анна'; date: string; pending?: boolean };
type Screen = 'shopping' | 'expenses' | 'settings';
const icons: Record<string, string> = {
  bag: '<path d="M5 7h14l1 13H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2M9 13c0 4 6 4 6 0"/>',
  list: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3h6v4H9zM9 12h6M9 16h4"/>',
  chart: '<path d="M12 3v9h9A9 9 0 1 1 12 3Z"/><path d="M16 3.9A9 9 0 0 1 20.1 8H16V3.9Z"/>',
  moon: '<path d="M20.8 13.2A9 9 0 0 1 10.8 3.1a9 9 0 1 0 10 10.1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="m5 12 4 4L19 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
  cross: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const tags: Record<TagKey, { name: string; color: string }> = {
  weekly: { name: 'На тиждень', color: '' }, breakfast: { name: 'Сніданок', color: 'lilac' },
  home: { name: 'Для дому', color: 'blue' }, sale: { name: 'За акцією', color: 'peach' },
  family: { name: 'Для сніданків усієї родини', color: 'lilac' },
};
const products: DemoProduct[] = [
  { name: 'Молоко безлактозне', description: 'Для ранкової кави', price: 68.5, category: 'Продукти', tags: ['weekly', 'breakfast'], author: 'Олексій', date: '29 жовт., 09:41' },
  { name: 'Авокадо', description: 'Обрати стиглі', price: 89, category: 'Продукти', tags: ['breakfast'], author: 'Анна', date: '29 жовт., 09:32' },
  { name: 'Хліб на заквасці', description: '', price: 74, category: 'Продукти', tags: ['weekly', 'breakfast'], author: 'Олексій', date: '29 жовт., 09:28', pending: true },
  { name: 'Грецький йогурт натуральний без доданого цукру', description: '', price: 54.9, category: 'Продукти', tags: ['weekly', 'breakfast', 'sale', 'family'], author: 'Олексій', date: '28 жовт., 18:05' },
  { name: 'Яблука', description: 'Зелені', price: 42, category: 'Продукти', tags: [], author: 'Анна', date: '28 жовт., 17:12' },
  { name: 'Кава в зернах', description: 'Середнє обсмаження', price: 325, category: 'Продукти', tags: ['sale'], author: 'Олексій', date: '28 жовт., 16:40' },
  { name: 'Засіб для миття посуду', description: 'Без різкого запаху', price: 112, category: 'Для дому', tags: ['home', 'weekly'], author: 'Олексій', date: '28 жовт., 15:11' },
  { name: 'Лампа для робочого столу', description: '', price: 2499, category: 'Для дому', tags: ['home'], author: 'Анна', date: '28 жовт., 12:30' },
  { name: 'Приклад максимальної суми й довгого тегу', description: 'Крайовий випадок для перевірки макета', price: 99999999.99, category: 'Обов’язкові покупки', tags: ['family', 'weekly'], author: 'Олексій', date: '29 жовт., 09:41' },
];
const expenses = [
  { ...products[0], price: 68.5, category: 'Продукти', tags: ['weekly', 'breakfast'] as TagKey[] },
  { ...products[5], price: 325, category: 'Продукти', tags: ['weekly'] as TagKey[] },
  { ...products[6], price: 112, category: 'Для дому', tags: ['home'] as TagKey[] },
  { ...products[7], price: 2499, category: 'Для дому', tags: ['home'] as TagKey[] },
  { ...products[0], name: 'Вітаміни', description: '', price: 420, category: 'Здоров’я', tags: ['weekly'] as TagKey[] },
];
const money = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let currentScreen: Screen = 'shopping';
let currentCategory = 'Продукти';
let selected: TagKey[] = [];
let emptyMonth = false;
const screen = document.querySelector<HTMLElement>('#screen')!;

// Escape text before inserting demo values into HTML, mirroring safe UI rendering.
function escapeText(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
function icon(name: string): string { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.bag}</svg>`; }
function tag(key: TagKey, control = false, chosen = false): string {
  const item = tags[key]; const content = `${escapeText(item.name)}${control ? icon(chosen ? 'cross' : 'plus') : ''}`;
  return control ? `<button class="tag ${item.color}" data-tag="${key}" aria-label="${chosen ? 'Прибрати' : 'Додати'} тег ${item.name}">${content}</button>` : `<span class="tag ${item.color}">${content}</span>`;
}
function filterPanel(): string {
  return `<aside class="sidebar" aria-label="Фільтри за тегами"><section class="filter-panel"><div class="filter-title"><h2>Фільтри</h2><button class="text-button" data-reset>Скинути</button></div>
    <p class="filter-label">Вибрані теги</p><div class="selected-tags">${selected.length ? selected.map((key) => tag(key, true, true)).join('') : '<span class="empty-hint">Теги ще не вибрані</span>'}</div>
    <p class="filter-label">Доступні теги</p><div class="filter-tags">${(Object.keys(tags) as TagKey[]).filter((key) => !selected.includes(key)).map((key) => tag(key, true)).join('') || '<span class="empty-hint">Усі теги вибрано</span>'}</div>
    <p class="filter-note">Знайдемо покупки, що містять усі вибрані теги.</p></section><div class="sidebar-note">${icon('lock')}<span>Дані належать вашому простору.</span></div></aside>`;
}
function productRow(product: DemoProduct, isExpense = false): string {
  const isOther = product.author === 'Анна';
  return `<li class="product"><span class="product-symbol" aria-hidden="true">${icon('bag')}</span><div class="product-info"><h3>${escapeText(product.name)}</h3>
    ${product.description ? `<p class="product-description">${escapeText(product.description)}</p>` : ''}
    ${isExpense ? `<p class="product-description">${escapeText(product.category)} · 29 жовтня</p>` : ''}
    ${product.tags.length ? `<div class="product-tags" aria-label="Теги продукту">${product.tags.map((key) => tag(key)).join('')}</div>` : ''}
    <p class="author"><span class="avatar small ${isOther ? 'alternate' : ''}" aria-hidden="true">${isOther ? 'АН' : 'ОЛ'}</span>${product.author}<span>·</span>${product.date}</p></div>
    <div class="product-end"><p class="price ${product.price >= 1000000 ? 'large' : ''}">${money.format(product.price)}<small>грн</small></p>
    ${product.pending && !isExpense ? '<p class="pending"><span class="pending-dot"></span>Зберігається</p>' : `<div class="row-actions">${isExpense ? `<button class="icon-button" data-demo="Видалення покупки збереже чинне підтвердження та правила витрат." aria-label="Видалити ${escapeText(product.name)}">${icon('trash')}</button>` : `${!isOther ? `<button class="icon-button complete" data-demo="Завершений продукт зникне з категорії та потрапить у витрати. У макеті дані не змінюються." aria-label="Завершити ${escapeText(product.name)}">${icon('check')}</button><details class="menu"><summary aria-label="Дії з продуктом ${escapeText(product.name)}">${icon('more')}</summary><div class="menu-content"><button data-demo="Форма редагування використовуватиме ті самі кольори, поля та заокруглення.">${icon('edit')}Редагувати</button><button class="delete" data-demo="Перед видаленням залишиться чинне підтвердження.">${icon('trash')}Видалити</button></div></details>` : '<span class="pending">Продукт Анни</span>'}`}</div>`}
    </div></li>`;
}
function specimens(): string {
  return `<section class="specimen" aria-labelledby="buttons-heading"><div class="specimen-heading"><h2 id="buttons-heading">Характер кнопок</h2><p>Зразки для погодження</p></div><div class="specimen-body">
    <div class="specimen-item"><button class="button primary" data-demo="Основна дія: помаранчевий акцент, темний читабельний напис.">${icon('plus')}Додати</button><small>Основна</small></div>
    <div class="specimen-item"><button class="button neutral" data-demo="Підтвердження у формах і діалогах.">Зберегти ${icon('check')}</button><small>Підтвердження</small></div>
    <div class="specimen-item"><button class="button secondary" data-demo="Другорядна дія не змагається з основною.">Скасувати</button><small>Другорядна</small></div>
    <div class="specimen-item"><button class="button danger" data-demo="Небезпечна дія має окремий колір і підтвердження.">${icon('trash')}Видалити</button><small>Небезпечна</small></div>
    <div class="specimen-item"><button class="button primary" disabled>Додати</button><small>Недоступна</small></div>
    <div class="specimen-item"><button class="button neutral" disabled>${icon('clock')}Збереження…</button><small>Очікування</small></div></div></section>`;
}
function intro(title: string, subtitle: string, expense = false): string {
  return `<div class="page-intro ${expense ? 'expenses-intro' : ''}"><div><p class="eyebrow">Мій простір · 29 жовтня 2026</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${expense ? `<div class="month-picker"><label class="eyebrow" for="month" style="margin:0">Період</label><select id="month"><option value="oct" ${!emptyMonth ? 'selected' : ''}>Жовтень 2026</option><option value="sep" ${emptyMonth ? 'selected' : ''}>Вересень 2026</option></select></div>` : `<span class="workspace-pill">${icon('home')}Мій простір</span>`}</div>`;
}
function shopping(): string {
  const visible = products.filter((product) => product.category === currentCategory && selected.every((key) => product.tags.includes(key)));
  return `${intro('Список покупок', 'Трохи порядку. Більше часу на своє.')}<div class="layout">${filterPanel()}<section class="content" aria-label="Продукти категорії"><nav class="categories" aria-label="Категорії">${['Продукти', 'Для дому', 'Здоров’я', 'Обов’язкові покупки'].map((category) => `<button class="category" data-category="${category}" aria-pressed="${category === currentCategory}">${category}</button>`).join('')}</nav>
    <div class="list-toolbar"><h2>${currentCategory}<span class="count">${visible.length} позицій</span></h2><span class="list-caption">${icon('clock')}Спочатку нові</span></div>
    <div class="sticky-add"><button class="button primary wide" data-demo="Тут відкриватиметься форма: назва, опис, ціна, категорія та кілька тегів. Це макет, без збереження даних.">${icon('plus')}Додати продукт</button></div>
    ${visible.length ? `<ul class="product-list">${visible.map((product) => productRow(product)).join('')}</ul>` : `<section class="empty"><h3>${selected.length ? 'Покупок із цими тегами немає' : 'Тут поки порожньо'}</h3><p>${selected.length ? 'Спробуйте прибрати один із вибраних тегів.' : 'Додайте перший продукт до цієї категорії.'}</p></section>`}
    <p class="footnote">${icon('check')}Куплене зберігається у витратах</p></section></div>${specimens()}`;
}
function analytics(): string {
  const visible = emptyMonth ? [] : expenses.filter((product) => selected.every((key) => product.tags.includes(key)));
  const totalCents = visible.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
  const palette: Record<string, string> = { 'Продукти': '#e9a326', 'Для дому': '#92a978', 'Здоров’я': '#a79ac5' };
  const grouped = Array.from(new Set(visible.map((item) => item.category))).map((category) => ({ category, cents: visible.filter((item) => item.category === category).reduce((sum, item) => sum + Math.round(item.price * 100), 0), count: visible.filter((item) => item.category === category).length }));
  let offset = 0;
  const rings = grouped.map((group) => { const share = totalCents ? group.cents / totalCents * 100 : 0; const markup = `<circle cx="110" cy="110" r="89" pathLength="100" stroke="${palette[group.category]}" stroke-dasharray="${Math.max(0, share - 1.2)} ${100 - Math.max(0, share - 1.2)}" stroke-dashoffset="${-offset}"/>`; offset += share; return markup; }).join('');
  return `${intro('Витрати', 'Ваші покупки. Зрозуміла картина місяця.', true)}<div class="layout">${filterPanel()}<div class="content"><section class="analytics-card" aria-labelledby="chart-title"><div class="analytics-heading"><div><h2 id="chart-title">На що пішли кошти</h2><p>${emptyMonth ? 'Вересень' : 'Жовтень'} 2026 · ${visible.length} покупок</p></div><span class="period-badge">UAH</span></div><div class="chart-layout"><div class="donut"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="89" style="stroke:var(--soft)"/>${rings}</svg><div class="donut-center"><span class="donut-value">${money.format(totalCents / 100)}</span><span class="donut-unit">гривень</span><span class="donut-caption">${selected.length ? 'За вибраними тегами' : 'Витрачено за місяць'}</span></div></div>
    ${grouped.length ? `<ul class="legend" aria-label="Суми витрат за категоріями">${grouped.map((group) => `<li class="legend-item"><span class="legend-dot" style="background:${palette[group.category]}"></span><span class="legend-label">${group.category}<small>${group.count} покупок · ${totalCents ? Math.round(group.cents / totalCents * 100) : 0}%</small></span><span class="legend-amount">${money.format(group.cents / 100)} ₴</span></li>`).join('')}</ul>` : '<p class="subtitle">За цей період витрат немає.</p>'}</div><p class="chart-note">${selected.length ? 'Графік, сума та покупки враховують усі вибрані теги.' : 'Лише завершені покупки. Активний список не впливає на суму.'} Межі місяця — за Києвом.</p></section>
    <section class="expense-list" aria-label="Історія витрат"><div class="list-toolbar"><h2>Покупки<span class="count">${visible.length} позицій</span></h2></div>${visible.length ? `<ul class="product-list">${visible.map((product) => productRow(product, true)).join('')}</ul>` : '<div class="empty"><h3>Витрат поки немає</h3><p>Тут з’являться завершені покупки цього місяця.</p></div>'}</section></div></div>${specimens()}`;
}
function settings(): string {
  return `${intro('Налаштування', 'Ваш акаунт та порядок у вашому просторі.')}<div class="settings-grid"><section class="settings-card"><p class="eyebrow">Акаунт</p><h2>Олексій</h2><p>Ваш Google-акаунт · Власник простору</p><button class="button secondary" data-demo="Кнопка виходу залишається в налаштуваннях. У макеті сесія не змінюється.">Вийти з акаунта</button></section><section class="settings-card"><h2>Оформлення</h2><p>Обирайте зручну для себе тему.</p><div class="theme-samples"><button class="theme-sample light" data-theme-choice="light">Світла</button><button class="theme-sample dark" data-theme-choice="dark">Темна</button></div></section><section class="settings-card"><h2>Теги</h2><p>Колір і назва допомагають швидко знайти потрібне.</p><div class="product-tags">${(Object.keys(tags) as TagKey[]).map((key) => tag(key)).join('')}</div><button class="button primary" data-demo="У робочій формі залишаються поля назви та кольору тегу.">${icon('plus')}Створити тег</button></section><section class="settings-card"><h2>Категорії</h2><p>Мій простір · Продукти, Для дому, Здоров’я</p><button class="button secondary" data-demo="У налаштуваннях залишаються створення, перейменування й видалення порожніх категорій.">${icon('plus')}Створити категорію</button></section></div>${specimens()}`;
}
// Render only mock screens. Switching theme does not touch account preferences.
function setTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
  toggle.innerHTML = icon(theme === 'light' ? 'moon' : 'sun');
  toggle.setAttribute('aria-label', theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему');
}
function render(): void {
  screen.innerHTML = currentScreen === 'shopping' ? shopping() : currentScreen === 'expenses' ? analytics() : settings();
  document.querySelectorAll<HTMLElement>('[data-page]').forEach((element) => { if (element.dataset.page === currentScreen) element.setAttribute('aria-current', 'page'); else element.removeAttribute('aria-current'); });
}
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon!); });
// Event delegation preserves a small, dependency-free preview and supports keyboard clicks.
document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  if (target.dataset.page) { currentScreen = target.dataset.page as Screen; selected = []; render(); window.scrollTo(0, 0); }
  else if (target.id === 'theme-toggle') setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  else if (target.dataset.themeChoice) setTheme(target.dataset.themeChoice as 'light' | 'dark');
  else if (target.dataset.category) { currentCategory = target.dataset.category; render(); }
  else if (target.dataset.tag) { const key = target.dataset.tag as TagKey; selected = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]; render(); }
  else if (target.hasAttribute('data-reset')) { selected = []; render(); }
  else if (target.dataset.demo) { document.querySelector<HTMLElement>('#dialog-description')!.textContent = target.dataset.demo; document.querySelector<HTMLDialogElement>('#preview-dialog')!.showModal(); }
});
document.addEventListener('change', (event) => { const target = event.target as HTMLSelectElement; if (target.id === 'month') { emptyMonth = target.value === 'sep'; render(); } });
render();
export {};
