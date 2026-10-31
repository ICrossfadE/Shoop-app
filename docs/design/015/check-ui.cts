// Isolated rendering uses the real React components, never a public demo route.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const appRoot = path.resolve('shopik-app');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const runtimeRequire = createRequire(path.join(process.argv[2], 'package.json'));
const { chromium } = runtimeRequire('playwright');
const output = path.resolve('docs/design/015/screenshots');
fs.mkdirSync(output, { recursive: true });
// Collect production CSS so fixture layout is identical to application styles.
function cssFiles(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry) => entry.isDirectory() ? cssFiles(path.join(dir,entry.name)) : entry.name.endsWith('.css') ? [path.join(dir,entry.name)] : []); }
const css = cssFiles(path.join(appRoot,'.next/static')).map((file) => fs.readFileSync(file,'utf8')).join('\n');
(async () => {
  const webpackModule = appRequire('next/dist/compiled/webpack/webpack');

  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'shopik-ui-'));
  await new Promise((resolve,reject) => webpackModule.webpack({mode:'development',devtool:false,entry:path.resolve('docs/design/015/fixture.tsx'),output:{path:temp,filename:'fixture.js',publicPath:''},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-list':path.resolve('docs/design/015/stubs.ts'),'@/app/products/actions':path.resolve('docs/design/015/stubs.ts'),[path.resolve(appRoot,'app/settings/actions.ts')]:path.resolve('docs/design/015/stubs.ts'),[path.resolve(appRoot,'app/categories/actions.ts')]:path.resolve('docs/design/015/stubs.ts'),[path.resolve(appRoot,'app/tags/actions.ts')]:path.resolve('docs/design/015/stubs.ts'),[path.resolve(appRoot,'app/auth/actions.ts')]:path.resolve('docs/design/015/stubs.ts'),'@':appRoot,'next/navigation':path.resolve('docs/design/015/stubs.ts')},modules:[path.join(appRoot,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.resolve('docs/design/013/typescript-loader.cts')}] }},(error,stats)=> error || stats.hasErrors() ? reject(error || new Error(stats.toString({all:false,errors:true}))) : resolve()));
  const bundle = fs.readFileSync(path.join(temp,'fixture.js'),'utf8');
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:3015/login');
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
    for (const width of [360,390,768,1440]) for (const theme of ['light','dark','pink','light-blue','light-green','light-pink']) {
      await page.setViewportSize({width,height:1100});
      await page.setContent(`<html lang="uk" data-theme="${theme}"><head><style>${css}</style></head><body><div id="fixture"></div></body></html>`);
      await page.addScriptTag({content:'window.process = { env: { NODE_ENV: "development" } };' + bundle});
      await page.locator('.recharts-sector').first().waitFor({timeout:10000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`overflow ${width}/${theme}`);
      // Wait for entry motion before measuring touch targets.
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
      assert.equal(await page.locator('.icon-action').first().evaluate((element) => element.getBoundingClientRect().width >= 44 && element.getBoundingClientRect().height >= 44),true);
      const menu = page.getByRole('button',{name:/Дії:/}).first();
      await menu.click();
      await page.getByRole('button',{name:'Редагувати',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await menu.evaluate((element) => element === document.activeElement),true);
      assert.equal(await menu.getAttribute('aria-expanded'),'false');
      const contrast = await page.evaluate(() => {
        const style=getComputedStyle(document.documentElement);
        const rgb=(key)=>style.getPropertyValue(key).trim();
        const luminance=(hex)=> { hex=hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(x=>x+x).join(''); const parts=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4); return parts[0]*0.2126+parts[1]*0.7152+parts[2]*0.0722; };
        const ratio=(a,b)=> { const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
        return {text:Math.min(...['--background','--surface','--soft'].flatMap(bg=>['--foreground','--muted','--link'].map(fg=>ratio(fg,bg)))),button:Math.min(ratio('--on-accent','--accent'),ratio('--on-accent','--accent-end')),focus:Math.min(ratio('--link','--surface'),ratio('--link','--background')),border:Math.min(ratio('--line','--surface'),ratio('--line','--background'))};
      });
      assert.ok(contrast.text >= 4.5,`text contrast ${theme}: ${JSON.stringify(contrast)}`);
      assert.ok(contrast.button >= 4.5,`button contrast ${theme}`);
      assert.ok(contrast.focus >= 3 && contrast.border >= 3,`boundary contrast ${theme}`);
      console.log('contrast',theme,width,contrast);
      const cards = await page.locator('.product-cards > article').evaluateAll((els) => els.map(el => { const r=el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; }));
      assert.equal(cards.length,2); assert.ok(cards[1].top > cards[0].bottom, 'separate cards');
      const field = page.locator('#tags input').first();
      await field.focus();
      assert.equal(await field.evaluate(el => getComputedStyle(el).outlineOffset),'0px');
      const cols = await page.locator('.settings-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(cols,width >= 768 ? 2 : 1);
      // A rejected header change must restore the exact colored palette in both controls.
      const previous = theme;
      await page.locator('#header-theme').selectOption(theme === 'dark' ? 'pink' : 'dark');
      await page.waitForFunction(t => document.documentElement.dataset.theme === t, previous);
      await page.waitForFunction(() => !document.querySelector('#header-theme').disabled);
      assert.equal(await page.locator('#header-theme').inputValue(), previous);
      assert.equal(await page.getByRole('group',{name:'Колірна тема'}).locator('[aria-pressed=true]').count(),1);
      await page.screenshot({path:path.join(output,`components-${theme}-${width}.png`),fullPage:true});
    }
    for (const theme of ['light','dark','pink','light-blue','light-green','light-pink']) {
      await page.context().addCookies([{name:'shopik-theme',value:theme,url:'http://localhost:3015',httpOnly:true}]);
      await page.goto('http://localhost:3015/login');
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),theme === 'dark' ? 'dark' : 'light');
      await page.screenshot({path:path.join(output,`login-${theme}.png`),fullPage:true});
    }
    await page.goto('http://localhost:3015/login');
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
    for (const theme of ['light','dark','pink','light-blue','light-green','light-pink']) {
      await page.evaluate(t=>{document.documentElement.dataset.theme=t; document.documentElement.style.colorScheme=t==='dark'?'dark':'light';},theme);
      await price.focus();
      assert.equal(await price.evaluate(el=>getComputedStyle(el).outlineOffset),'0px');
      await page.screenshot({path:path.join(output,`modal-${theme}-390.png`),fullPage:true});
    }
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
    console.log('PASS: 24 component layouts, long content, max price, zero chart, touch targets; production login. Client fixtures also verify chart rendering, menu Escape/focus, empty price, tag selection, animated numbers and reduced motion. Authenticated mutations remain unverified.');
  } finally { await browser.close(); }
})();


