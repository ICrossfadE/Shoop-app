import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Structural browser types keep the existing isolated runtime out of app dependencies.
type Locator = {
  click(options?: object): Promise<void>; fill(value: string): Promise<void>; check(): Promise<void>;
  waitFor(options?: object): Promise<void>; count(): Promise<number>; inputValue(): Promise<string>;
  getAttribute(name: string): Promise<string | null>; textContent(): Promise<string | null>;
  getByRole(role: string, options?: object): Locator; getByLabel(name: string, options?: object): Locator;
  locator(selector: string): Locator; filter(options: object): Locator; first(): Locator;
  evaluate<T>(callback: (element: HTMLElement) => T): Promise<T>;
};
type Route = { request(): { method(): string }; fetch(): Promise<unknown>; abort(): Promise<void>; continue(): Promise<void> };
type Page = Omit<Locator, 'evaluate'> & {
  goto(url: string): Promise<unknown>; reload(): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  screenshot(options: object): Promise<unknown>; keyboard: { press(key: string): Promise<void> };
  route(url: string, handler: (route: Route) => Promise<void>): Promise<void>; unroute(url: string): Promise<void>;
  evaluate<T, A = undefined>(callback: (arg: A) => T, arg?: A): Promise<T>;
  waitForFunction(callback: () => boolean): Promise<void>;
  once(event: string, handler: (dialog: { accept(): Promise<void> }) => void): void;
  context(): { addCookies(cookies: object[]): Promise<void> };
};
type Database = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, string | number>[] }> };

// Drive production pages through real Server Actions, SQL/RLS, cache and navigation.
export async function checkWorkflow({ db, owner, wid, cid, homeId, uid, joinerId, pageFor, sessionFor, output, errors }: {
  db: Database; owner: Page; wid: string; cid: string; homeId: string; uid: string; joinerId: string;
  pageFor(auth?: unknown): Promise<Page>; sessionFor(id: string, name: string): unknown; output: string; errors: string[];
}) {
  const origin = 'http://127.0.0.1:3191';
  const dialog = owner.locator('dialog[open]');
  const food = owner.locator('[data-category="' + cid + '"]');
  const home = owner.locator('[data-category="' + homeId + '"]');
  const money = (value: number) => value.toFixed(2).replace('.', ',');
  async function expectSql(sql: string, expected: number, values: unknown[] = []) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const actual = Number((await db.query(sql, values)).rows[0].n);
      if (actual === expected) return;
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    assert.equal(Number((await db.query(sql, values)).rows[0].n), expected, sql);
  }
  async function expectTotal(page: Page, expected: number) {
    await page.locator('.shopping-total strong').filter({ hasText: money(expected) }).waitFor();
  }
  async function expand(page: Page, id: string) {
    const toggle = page.locator('[data-category="' + id + '"] .category-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  }
  async function create(page: Page, categoryName: string, name: string, price: string, quantity = '', tag?: string) {
    await page.getByRole('button', { name: 'Додати товар у категорію ' + categoryName, exact: true }).click();
    const modal = page.locator('dialog[open]');
    await modal.getByLabel('Назва', { exact: true }).fill(name);
    await modal.getByLabel('Ціна за штуку, грн').fill(price);
    await modal.getByLabel('Кількість, шт.').fill(quantity);
    if (tag) {
      await modal.getByRole('button', { name: '+ Додати тег', exact: true }).click();
      await modal.getByLabel('Назва тегу', { exact: true }).fill(tag);
      await modal.getByRole('button', { name: 'Створити тег', exact: true }).click();
      await modal.getByRole('button', { name: 'Прибрати тег ' + tag, exact: true }).waitFor();
      assert.equal(await modal.getByLabel('Назва', { exact: true }).inputValue(), name);
    }
    await modal.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    await expectSql('select count(*) n from public.products where workspace_id=$1 and name=$2', 1, [wid, name]);
  }
  await db.query('insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,\'member\')', [wid, joinerId]);
  await owner.goto(origin + '/');
  await owner.getByRole('heading', { name: 'Список продуктів', exact: true }).waitFor();
  assert.equal(await food.locator('.category-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await home.locator('.category-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await owner.locator('.filter-accordion').getAttribute('open'), null);
  assert.ok(!(await owner.locator('.workspace-context').textContent())!.includes(wid.slice(0, 8)));
  await expectTotal(owner, 35);

  // Category-specific creation retains collapse state and silently updates the full total.
  await create(owner, 'Їжа', 'Кава 019', '70', '3', 'Тег A 019');
  assert.equal(await food.locator('.category-toggle').getAttribute('aria-expanded'), 'false');
  await create(owner, 'Дім', 'Серветки 019', '20', '2', 'Тег B 019');
  assert.equal(await owner.locator('.create-notice').count(), 0);
  await expectTotal(owner, 285);
  await owner.getByRole('button', { name: 'Створити', exact: true }).click();
  await owner.getByRole('button', { name: 'Створити продукт', exact: true }).click();
  assert.equal(await dialog.getByLabel('Категорія', { exact: true }).inputValue(), homeId);
  await dialog.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expand(owner, cid); await expand(owner, homeId);
  await owner.getByRole('heading', { name: 'Кава 019', exact: true }).waitFor();

  // Multiple tags form a union across all categories, even when a category is collapsed.
  await owner.locator('.filter-accordion > summary').click();
  await owner.getByRole('button', { name: 'Додати тег Тег A 019', exact: true }).click();
  await owner.getByRole('button', { name: 'Додати тег Тег B 019', exact: true }).click();
  await expectTotal(owner, 250);
  assert.equal(await food.locator('.category-toggle').getAttribute('aria-expanded'), 'true');
  await owner.getByLabel('Їжа', { exact: true }).click();
  await expectTotal(owner, 40);
  await owner.getByRole('heading', { name: 'Кава 019', exact: true }).waitFor();
  await owner.getByRole('button', { name: 'Усі категорії', exact: true }).click();
  await expectTotal(owner, 250);

  // A single completion can be cancelled without touching storage or totals.
  await owner.screenshot({path: path.join(output, 'filtered-products.png'), fullPage: true});
  await owner.getByRole('button', { name: 'Завершити Кава 019', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Перемістити у куплене / витрати?', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expectSql('select count(*) n from public.expenses where workspace_id=$1', 0, [wid]);

  // Select across categories, lose the committed response, then safely retry the whole batch.
  await owner.getByRole('button', { name: 'Вибрати товари', exact: true }).click();
  await owner.getByLabel('Вибрати Кава 019', { exact: true }).check();
  await owner.getByLabel('Вибрати Серветки 019', { exact: true }).check();
  await owner.getByRole('button', { name: 'Перемістити у витрати', exact: true }).click();
  let drop = true;
  await owner.route(origin + '/**', async route => {
    if (drop && route.request().method() === 'POST') { drop = false; await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Перемістити', exact: true }).click();
  await dialog.getByRole('button', { name: 'Перевірити / повторити', exact: true }).waitFor();
  await expectSql('select count(*) n from public.expenses where workspace_id=$1', 2, [wid]);
  await owner.unroute(origin + '/**');
  await dialog.getByRole('button', { name: 'Перевірити / повторити', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await expectSql('select count(*) n from public.expenses where workspace_id=$1', 2, [wid]);
  await expectTotal(owner, 0);
  await expectSql('select count(*) n from public.expenses where workspace_id=$1 and planned_amount=210', 1, [wid]);

  // An invited member corrects another author's actual amount without changing its plan.
  const member = await pageFor(sessionFor(joinerId, 'Invited user'));
  await member.context().addCookies([{ name: 'shopik-workspace', value: wid, url: origin, sameSite: 'Lax' }]);
  await member.goto(origin + '/expenses');
  await member.getByRole('heading', { name: 'Кава 019', exact: true }).waitFor();
  await member.locator('.filter-accordion > summary').click();
  await member.getByRole('button', { name: 'Додати тег Тег A 019', exact: true }).click();
  await member.getByRole('button', { name: 'Додати тег Тег B 019', exact: true }).click();
  await member.locator('.donut-center strong').filter({ hasText: '250,00' }).waitFor();
  await member.getByRole('heading', { name: 'Серветки 019', exact: true }).waitFor();
  async function correct(price: string) {
    await member.getByRole('button', { name: 'Дії: Кава 019', exact: true }).click();
    await member.getByRole('button', { name: 'Редагувати суму', exact: true }).click();
    const modal = member.locator('dialog[open]');
    await modal.getByLabel('Повна сума, грн').fill(price);
    await modal.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
  }
  await correct('180');
  await member.locator('.savings-summary').filter({ hasText: 'Економія: 30,00' }).waitFor();
  await correct('230');
  await member.locator('.savings-summary').filter({ hasText: 'Перевитрата: 20,00' }).waitFor();
  await expectSql('select count(*) n from public.expenses where workspace_id=$1 and planned_amount=210 and amount=230', 1, [wid]);
  await member.getByRole('button', { name: 'Дії: Серветки 019', exact: true }).click();
  member.once('dialog', popup => void popup.accept());
  await member.getByRole('button', { name: 'Видалити', exact: true }).click();
  await expectSql('select count(*) n from public.expenses where workspace_id=$1', 1, [wid]);

  // Management works in the opposite direction and preserves original authorship.
  await member.goto(origin + '/');
  await create(member, 'Дім', 'Від учасника 019', '15');
  await owner.goto(origin + '/'); await expand(owner, homeId);
  await owner.getByRole('button', { name: 'Дії: Від учасника 019', exact: true }).click();
  await owner.getByRole('button', { name: 'Редагувати', exact: true }).click();
  await dialog.getByLabel('Назва', { exact: true }).fill('Спільне редагування 019');
  await dialog.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await expectSql('select count(*) n from public.products where workspace_id=$1 and name=$2 and created_by=$3', 1, [wid, 'Спільне редагування 019', joinerId]);
  await owner.getByRole('button', { name: 'Дії: Спільне редагування 019', exact: true }).click();
  await owner.getByRole('button', { name: 'Видалити', exact: true }).click();
  await dialog.getByRole('button', { name: 'Видалити', exact: true }).click();
  await expectSql('select count(*) n from public.products where workspace_id=$1 and name=$2', 0, [wid, 'Спільне редагування 019']);

  // Settings remove tags with confirmation while completed snapshots remain readable.
  await member.goto(origin + '/settings');
  await member.getByRole('button', { name: 'Видалити тег Тег A 019', exact: true }).click();
  await member.getByRole('alertdialog', { name: 'Видалення тегу' }).getByRole('button', { name: 'Видалити тег', exact: true }).click();
  await expectSql('select count(*) n from public.tags where workspace_id=$1 and name=$2 and deleted_at is not null', 1, [wid, 'Тег A 019']);
  await expectSql('select count(*) n from public.expenses where workspace_id=$1 and jsonb_array_length(tags)=1', 1, [wid]);

  // Route transitions keep viewport scale and heading typography stable.
  await owner.goto(origin + '/');
  const before = await owner.evaluate(() => ({ font: getComputedStyle(document.querySelector('main h1')!).fontSize, scale: visualViewport!.scale }));
  await owner.getByRole('link', { name: 'Витрати', exact: true }).click();
  await owner.getByRole('heading', { name: 'Витрати', exact: true }).waitFor();
  const after = await owner.evaluate(() => ({ font: getComputedStyle(document.querySelector('main h1')!).fontSize, scale: visualViewport!.scale }));
  assert.deepEqual(after, before);
  await owner.getByRole('link', { name: 'Список покупок', exact: true }).click();
  await food.locator('.category-toggle').waitFor();
  assert.equal(await food.locator('.category-toggle').getAttribute('aria-expanded'), 'false');

  let layouts = 0;
  for (const screen of ['/', '/expenses', '/settings']) {
    await owner.goto(origin + screen);
    await owner.getByRole('heading', { name: screen === '/' ? 'Список продуктів' : screen === '/expenses' ? 'Витрати' : 'Налаштування акаунта', exact: true }).waitFor();
    for (const theme of ['light', 'dark', 'light-blue', 'light-green', 'light-pink', 'pink']) {
      await owner.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 360, 390, 768, 1440]) {
        await owner.setViewportSize({ width, height: 950 });
        await owner.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
        layouts++;
        if (width === 390 && ['light', 'dark', 'pink'].includes(theme)) await owner.screenshot({ path: path.join(output, theme + '-' + (screen === '/' ? 'products' : screen.slice(1)) + '.png'), fullPage: true });
      }
    }
  }
  await owner.setViewportSize({ width: 390, height: 950 });
  for (const screen of ['/', '/expenses', '/settings']) {
    await owner.goto(origin + screen);
    await owner.getByRole('heading', { name: screen === '/' ? 'Список продуктів' : screen === '/expenses' ? 'Витрати' : 'Налаштування акаунта', exact: true }).waitFor();
    await owner.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await owner.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await owner.evaluate(() => { document.documentElement.style.fontSize = ''; });
  }
  await owner.goto(origin + '/'); await owner.setViewportSize({ width: 740, height: 390 });
  await owner.getByRole('button', { name: 'Додати товар у категорію Їжа', exact: true }).click();
  assert.equal(await dialog.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.width <= innerWidth; }), true);
  await owner.keyboard.press('Escape');
  await dialog.waitFor({state: 'hidden'});
  await owner.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Додати товар у категорію Їжа');
  assert.equal(await owner.getByRole('button', { name: 'Додати товар у категорію Їжа', exact: true }).evaluate(element => document.activeElement === element), true);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, isolated: true, layouts, scenarios: ['category creation and memory', 'quantity and total', 'inline tags', 'OR tags across categories', 'category subtotal selection', 'single cancel', 'atomic batch and lost-response retry', 'mutual management', 'plan/actual/savings/overspending', 'tag deletion preserves history', 'collapsed categories on return', 'stable viewport', 'six themes/five widths', '200% text', 'landscape dialog and focus'], productionDatabaseChanged: false }, null, 2));
  console.log('PASS task 019 E2E:', layouts, 'responsive layouts and persisted workflow scenarios');
}
