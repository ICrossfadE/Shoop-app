// Isolated rendering uses the real React components, never a public demo route.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const appRoot = path.resolve('shopik-app');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const runtimeRequire = createRequire(path.join(process.argv[2], 'package.json'));
const { chromium } = runtimeRequire('playwright');
const output = path.resolve('docs/design/014/screenshots');
fs.mkdirSync(output, { recursive: true });
// Collect production CSS so fixture layout is identical to application styles.
function cssFiles(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry) => entry.isDirectory() ? cssFiles(path.join(dir,entry.name)) : entry.name.endsWith('.css') ? [path.join(dir,entry.name)] : []); }
const css = cssFiles(path.join(appRoot,'.next/static')).map((file) => fs.readFileSync(file,'utf8')).join('\n');
(async () => {
  const webpackModule = appRequire('next/dist/compiled/webpack/webpack');

  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'shopik-ui-'));
  await new Promise((resolve,reject) => webpackModule.webpack({mode:'development',devtool:false,entry:path.resolve('docs/design/014/fixture.tsx'),output:{path:temp,filename:'fixture.js',publicPath:''},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-list':path.resolve('docs/design/014/editor-stubs.ts'),'@/app/products/actions':path.resolve('docs/design/014/editor-stubs.ts'),'@':appRoot},modules:[path.join(appRoot,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.resolve('docs/design/013/typescript-loader.cts')}] }},(error,stats)=> error || stats.hasErrors() ? reject(error || new Error(stats.toString({all:false,errors:true}))) : resolve()));
  const bundle = fs.readFileSync(path.join(temp,'fixture.js'),'utf8');
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
    for (const width of [360,390,768,1440]) for (const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1100});
      await page.setContent(`<html lang="uk" data-theme="${theme}"><head><style>${css}</style></head><body><div id="fixture"></div></body></html>`);
      await page.addScriptTag({content:'window.process = { env: { NODE_ENV: "development" } };' + bundle});
      await page.locator('.recharts-sector').first().waitFor({timeout:10000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`overflow ${width}/${theme}`);
      // Wait for entry motion before measuring touch targets.
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
      assert.equal(await page.locator('.icon-action').first().evaluate((element) => element.getBoundingClientRect().width >= 44 && element.getBoundingClientRect().height >= 44),true);
      const menu = page.getByRole('button',{name:/Дії:/});
      await menu.click();
      await page.getByRole('button',{name:'Редагувати',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await menu.evaluate((element) => element === document.activeElement),true);
      assert.equal(await menu.getAttribute('aria-expanded'),'false');
      await page.screenshot({path:path.join(output,`components-${theme}-${width}.png`),fullPage:true});
    }
    await page.goto('http://localhost:3014/login');
    assert.equal(await page.locator('h1').textContent(),'Shopik');
    await page.screenshot({path:path.join(output,'login-light.png'),fullPage:true});
    // Exercise real editor controls and respect reduced motion without persisting data.
    await page.setViewportSize({width:390,height:900});
    await page.setContent('<html lang="uk"><head><style>'+css+'</style></head><body><div id="fixture"></div></body></html>');
    await page.addScriptTag({content:'window.process = { env: { NODE_ENV: "development" } };' + bundle});
    await page.getByRole('button',{name:'Відкрити форму'}).click();
    const price=page.getByLabel('Ціна, грн');
    assert.equal(await price.inputValue(),'');
    assert.equal(await price.getAttribute('placeholder'),'0');
    await price.fill('12,50');
    assert.equal(await price.inputValue(),'12,50');
    await page.getByRole('button',{name:'Додати тег Темний тег',exact:true}).click();
    await page.getByRole('button',{name:'Прибрати тег Темний тег',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'modal-390.png'),fullPage:true});
    assert.equal(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth),true);
    await page.getByRole('button',{name:'Прибрати тег Темний тег',exact:true}).click();
    await page.getByRole('button',{name:'Додати тег Темний тег',exact:true}).waitFor();
    await page.getByRole('button',{name:'Скасувати',exact:true}).click();
    await page.getByRole('button',{name:'Змінити число'}).click();
    await page.waitForFunction(() => document.querySelector('[data-number] [aria-hidden]')?.textContent?.includes('200'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'Змінити число'}).click();
    await page.waitForFunction(() => document.querySelector('[data-number] [aria-hidden]')?.textContent?.includes('10'));
    assert.equal(await page.locator('.product-row').first().evaluate((el) => getComputedStyle(el).animationName),'none');
    assert.deepEqual(errors,[]);
    console.log('PASS: 8 component layouts, long content, max price, zero chart, touch targets; production login. Client fixtures also verify chart rendering, menu Escape/focus, empty price, tag selection, animated numbers and reduced motion. Authenticated mutations remain unverified.');
  } finally { await browser.close(); }
})();


