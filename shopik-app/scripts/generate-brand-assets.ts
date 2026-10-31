import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// Reuse the installed browser test runtime and the app's built Montserrat font.
const runtimePath = process.env.SHOPIK_BROWSER_MODULES;
if (!runtimePath) throw new Error('Set SHOPIK_BROWSER_MODULES to the browser runtime node_modules directory.');
const runtime = createRequire(path.join(runtimePath, 'package.json'));
const { chromium } = runtime('playwright');
const requireApp = createRequire(path.join(process.cwd(), 'package.json'));
const sharp = requireApp('sharp');
const cssFiles = await fs.readdir('.next/static/css');
let fontFaces = '';
for (const file of cssFiles) {
  if (!file.endsWith('.css')) continue;
  const css = await fs.readFile(path.join('.next/static/css', file), 'utf8');
  fontFaces += (css.match(/@font-face\{font-family:Montserrat;[^}]+\}/g) ?? []).join('\n');
}
if (!fontFaces) throw new Error('Build the app first to obtain its Montserrat font.');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route('https://brand.test/**', async (route: { request(): { url(): string }; fulfill(options: object): Promise<void> }) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.woff2')) {
      await route.fulfill({ body: await fs.readFile(path.join('.next/static/media', path.basename(url.pathname))), contentType: 'font/woff2' });
    } else await route.fulfill({ body: '<!doctype html><html><head></head><body></body></html>', contentType: 'text/html' });
  });
  await page.goto('https://brand.test/');
  // Match Navbar weight and proportional letter spacing, centered on a plain white canvas.
  async function render(width: number, height: number, fontSize: number, output: string) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>${fontFaces}html,body{margin:0;width:100%;height:100%;background:white}body{display:flex;align-items:center;justify-content:center}span{font-family:Montserrat;font-weight:750;font-size:${fontSize}px;letter-spacing:${-fontSize / 27}px;color:#2c2c2c;line-height:1}</style><span>Shopik</span>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: output });
  }
  await render(1200, 630, 180, 'app/opengraph-image.png');
  await render(512, 512, 110, 'app/icon.png');
  // ICO embeds RGBA PNG frames: Turbopack's ICO decoder requires an alpha channel.
  const sizes = [16, 32, 48, 64, 256];
  const frames: Buffer[] = await Promise.all(sizes.map(size => sharp('app/icon.png').resize(size, size).ensureAlpha().png().toBuffer()));
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frames[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frames[index].length;
  });
  await fs.writeFile('app/favicon.ico', Buffer.concat([directory, ...frames]));
  console.log('Generated Shopik favicon, 512px icon and 1200×630 Open Graph image.');
} finally {
  await browser.close();
}
