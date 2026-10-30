import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

// Use the existing desktop runtime's Playwright; this adds no project dependency.
const moduleRoot = process.argv[2];
if (!moduleRoot) throw new Error('Pass the existing runtime node_modules directory as the first argument.');
const { chromium } = createRequire(resolve(moduleRoot, 'package.json'))('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (error: Error) => { errors.push(error.message); });
await mkdir('docs/design/012/screenshots', { recursive: true });
const dimensions = [360, 390, 768, 1440];
const report: { width: number; theme: string; page: string; overflow: boolean }[] = [];

// Contrast checks protect legibility of the proposed palette in both themes.
function contrast(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const channels = hex.replace('#', '').match(/../g)!.map((channel) => parseInt(channel, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const a = luminance(hexA); const b = luminance(hexB);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

// Exercise responsive layouts, themes and filters against visible mock state.
try {
  await page.goto('http://127.0.0.1:3012/');
  await page.getByRole('heading', { name: 'Список покупок', exact: true }).waitFor();
  for (const width of dimensions) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      for (const section of ['Список покупок', 'Витрати']) {
        await page.getByRole('button', { name: section, exact: true }).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        report.push({ width, theme, page: section, overflow });
        assert.equal(overflow, false, `Horizontal overflow: ${width}, ${theme}, ${section}`);
        if (width === 390 || width === 1440) {
          await page.screenshot({ path: `docs/design/012/screenshots/${section === 'Витрати' ? 'expenses' : 'shopping'}-${theme}-${width}.png`, fullPage: true });
          if (width === 1440) await page.screenshot({ path: `docs/design/012/screenshots/${section === 'Витрати' ? 'expenses' : 'shopping'}-${theme}-desktop.png` });
        }
      }
      // Check an unusually large price and long tags at each width/theme.
      await page.getByRole('button', { name: 'Список покупок', exact: true }).click();
      await page.getByRole('button', { name: 'Обов’язкові покупки', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.getByRole('button', { name: 'Продукти', exact: true }).click();
      const palette = await page.evaluate(() => { const css = getComputedStyle(document.documentElement); return Object.fromEntries(['--page', '--surface', '--text', '--muted', '--accent', '--accent-end', '--accent-text', '--ink', '--on-ink'].map((name) => [name, css.getPropertyValue(name).trim()])); });
      for (const background of ['--page', '--surface']) {
        assert.ok(contrast(palette['--text'], palette[background]) >= 4.5);
        assert.ok(contrast(palette['--muted'], palette[background]) >= 4.5);
      }
      for (const background of ['--accent', '--accent-end']) assert.ok(contrast(palette['--accent-text'], palette[background]) >= 4.5);
      assert.ok(contrast(palette['--ink'], palette['--on-ink']) >= 4.5);
    }
  }
  // AND filtering updates the graph total and the same expense list.
  await page.getByRole('button', { name: 'Витрати', exact: true }).click();
  assert.match(await page.locator('.donut-value').innerText(), /3\s?424,50/);
  await page.getByRole('button', { name: 'Додати тег На тиждень', exact: true }).click();
  assert.match(await page.locator('.donut-value').innerText(), /813,50/);
  await page.getByRole('button', { name: 'Додати тег Сніданок', exact: true }).click();
  assert.match(await page.locator('.donut-value').innerText(), /68,50/);
  assert.equal(await page.locator('.expense-list .product').count(), 1);
  await page.getByRole('button', { name: 'Прибрати тег Сніданок', exact: true }).click();
  assert.match(await page.locator('.donut-value').innerText(), /813,50/);
  await page.getByRole('button', { name: 'Скинути', exact: true }).click();
  await page.getByLabel('Період').selectOption('sep');
  assert.equal(await page.locator('.donut-value').innerText(), '0,00');
  assert.equal(await page.locator('.expense-list .product').count(), 0);
  await page.getByLabel('Період').selectOption('oct');
  await page.getByRole('button', { name: 'Список покупок', exact: true }).click();
  await page.getByRole('button', { name: 'Здоров’я', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Тут поки порожньо', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Продукти', exact: true }).click();
  await page.getByRole('button', { name: 'Додати продукт', exact: true }).click();
  assert.equal(await page.locator('#preview-dialog').isVisible(), true);
  await page.getByRole('button', { name: 'Зрозуміло', exact: true }).click();
  await page.getByRole('button', { name: 'Налаштування акаунта', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Налаштування', exact: true }).count(), 1);
  assert.equal(errors.length, 0, errors.join('\n'));
  process.stdout.write(`${JSON.stringify({ layouts: report, checked: 'AND filters, exact mock totals, empty month, empty category, maximum price, long tags, palette text contrast, dialog, settings', errors }, null, 2)}\n`);
} finally { await browser.close(); }
