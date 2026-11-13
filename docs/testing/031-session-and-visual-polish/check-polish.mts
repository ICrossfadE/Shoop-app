import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Database } from '../019-shopping-workflow/check-workflow.mts';

// Reuse the isolated production/SQL fixture; no hosted account or data is touched.
export async function checkPolish({db, owner, wid, cid, uid, pageFor, output, errors, setMembershipFailure}: {
  db: Database; owner: Page; wid: string; cid: string; uid: string;
  pageFor(auth?: unknown): Promise<Page>; output: string; errors: string[];
  setMembershipFailure(value: boolean): void;
}) {
  const origin = 'http://127.0.0.1:3191';
  const guest = await pageFor();
  await guest.goto(origin + '/login');
  const toggle = guest.getByRole('button', {name: 'Спільний простір', exact: true});
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await guest.getByRole('textbox', {name: 'Посилання запрошення'}).count(), 0);
  await guest.screenshot({path: path.join(output, 'login-collapsed.png'), fullPage: true});
  await toggle.click();
  const invitation = guest.getByLabel('Посилання запрошення', {exact: true});
  await invitation.fill('https://example.invalid/entered-link');
  await toggle.evaluate(element => element.focus());
  await guest.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await guest.keyboard.press('Space');
  assert.equal(await invitation.inputValue(), 'https://example.invalid/entered-link');
  await guest.screenshot({path: path.join(output, 'login-expanded.png'), fullPage: true});

  // Product completion creates the real immutable plan via SQL triggers.
  for (const [name, price] of [['Покупка 031', 300], ['Велика сума 031', 9999699.99], ['Без плану 031', 0]] as const) {
    await db.query("insert into public.products(workspace_id,category_id,created_by,name,price,status) values($1,$2,$3,$4,$5,'completed')", [wid,cid,uid,name,price]);
  }
  await db.query("update public.expenses set planned_amount=null where workspace_id=$1 and name='Без плану 031'", [wid]);
  await owner.goto(origin + '/expenses');
  const row = owner.locator('.product-rows > li').filter({hasText: 'Покупка 031'});
  await row.waitFor();
  assert.equal(await row.locator('.product-price').getAttribute('data-tone'), 'neutral');
  assert.match((await owner.locator('.savings-summary').textContent())!, /Порівняно 2 із 3/);
  assert.match((await owner.locator('.expense-chart-total').textContent())!, /999/);
  const unknown = owner.locator('.product-rows > li').filter({hasText: 'Без плану 031'});
  assert.equal(await unknown.locator('.product-price').getAttribute('data-tone'), 'neutral');
  assert.match((await unknown.textContent())!, /Немає даних/);

  // A temporary membership backend error must not clear data or send users to login.
  setMembershipFailure(true);
  const transientStatuses = await owner.evaluate(async workspace => {
    const urls = ['/api/workspace?workspace='+workspace, '/api/lists?workspace='+workspace+'&kind=expenses&month='+new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit'}).format(new Date())];
    return Promise.all(urls.map(async url => (await fetch(url)).status));
  }, wid);
  assert.deepEqual(transientStatuses, [503,503]);
  await owner.evaluate(() => {window.dispatchEvent(new Event('focus'));});
  await owner.getByRole('alert').filter({hasText:'Не вдалося оновити довідники'}).waitFor();
  assert.equal(await row.count(), 1);
  setMembershipFailure(false);
  await owner.evaluate(() => {window.dispatchEvent(new Event('focus'));});
  await owner.getByRole('alert').filter({hasText:'Не вдалося оновити довідники'}).waitFor({state:'hidden'});

  // Repeated corrections exercise the Server Action, receipt, cache, SQL and tone.
  for (const [price, tone, label] of [['250','saving','Економія'], ['350','overrun','Перевитрата'], ['300','neutral','Різниця']] as const) {
    await row.getByRole('button', {name: 'Дії: Покупка 031', exact: true}).click();
    await owner.getByRole('button', {name: 'Редагувати суму', exact: true}).click();
    const dialog = owner.locator('dialog[open]');
    await dialog.locator('input').fill(price);
    await dialog.getByRole('button', {name: 'Зберегти', exact: true}).click();
    await dialog.waitFor({state: 'hidden'});
    await row.locator(`.product-price[data-tone="${tone}"]`).waitFor();
    assert.match((await row.locator('.expense-difference').textContent())!, new RegExp(label));
    const result = (await db.query("select amount,planned_amount from public.expenses where workspace_id=$1 and name='Покупка 031'",[wid])).rows[0];
    assert.equal(Number(result.amount), Number(price));
    assert.equal(Number(result.planned_amount), 300);
    if(tone!=='neutral') await owner.screenshot({path:path.join(output,`expense-${tone}.png`),fullPage:true});
  }

  let layouts = 0;
  // Check every theme/width against live production layout, including 200% text.
  for (const theme of ['light','dark','pink','light-blue','light-green','light-pink']) {
    await owner.evaluate(value => document.documentElement.dataset.theme=value, theme);
    for (const width of [320,360,390,768,1280]) {
      await owner.setViewportSize({width,height:950});
      for (const fontSize of ['100%', '200%']) {
        await owner.evaluate(value => {document.documentElement.style.fontSize=value;}, fontSize);
        const geometry = await owner.evaluate(() => {
          const total=document.querySelector('.expense-chart-total')!.getBoundingClientRect();
          const donut=document.querySelector('.donut')!.getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth>innerWidth+1, totalBottom:total.bottom, donutTop:donut.top, donutHeight:donut.height};
        });
        assert.equal(geometry.overflow, false, `${theme}/${width}/${fontSize} overflow`);
        assert.ok(geometry.totalBottom <= geometry.donutTop, 'Large total overlaps ring');
        assert.ok(geometry.donutHeight > 100, 'Chart collapsed');
        if (width<=390) {
          assert.equal(await row.locator('.expense-comparison').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length), 1, 'Narrow purchase metrics must stack');
        }
        layouts++;
      }
      await owner.evaluate(() => {document.documentElement.style.fontSize='100%';});
      if (width===390) await owner.screenshot({path:path.join(output, `expenses-${theme}-390.png`),fullPage:true});
    }
  }
  await owner.goto(origin + '/settings');
  const sectionIds = ['appearance','tags','categories','workspaces','members','account'];
  for (const id of sectionIds) await owner.locator('#'+id).waitFor();
  for (const theme of ['light','dark','pink','light-blue','light-green','light-pink']) {
    await owner.evaluate(value => document.documentElement.dataset.theme=value, theme);
    assert.equal(await owner.locator('.settings-grid > section').count(), 6);
    const borders = await owner.evaluate(() => Array.from(document.querySelectorAll('.settings-grid > section')).map(section=>getComputedStyle(section).borderTopWidth));
    assert.ok(borders.every(width=>width==='0px'));
    await owner.setViewportSize({width:390,height:950});
    await owner.screenshot({path:path.join(output, `settings-${theme}-390.png`),fullPage:true});
  }
  // Zero and empty states remain usable; database fixture is disposable.
  await db.query('delete from public.expenses where workspace_id=$1',[wid]);
  await owner.goto(origin + '/expenses');
  await owner.locator('.expense-chart-total strong').filter({hasText:'0,00'}).waitFor();
  await owner.screenshot({path:path.join(output, 'expenses-empty.png'),fullPage:true});
  // An actual revoked membership still denies private API data.
  await db.query('delete from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,uid]);
  const denied = await owner.evaluate(async workspace => (await fetch('/api/workspace?workspace='+workspace)).status, wid);
  assert.equal(denied,403);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,isolated:true,layouts,settingsSections:sectionIds,scenarios:['login keyboard/collapse/preserved input','temporary membership failure keeps session and data; recovery works','actual membership revocation returns 403','real price corrections and unchanged plan','known/unknown/equal comparison','large total outside ring','six themes/five widths/200% text','settings sections and soft borders','empty/zero state']},null,2));
  console.log(`PASS: 031 production UI, real corrections, preserved sections, login keyboard and ${layouts} theme/width/text layouts (isolated SQL/Auth).`);
}
