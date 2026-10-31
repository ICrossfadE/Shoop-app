import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';

// Runs inside the invitation fixture: all database/Auth requests remain local.
export async function checkWorkspaces({db,owner,member,wid,joinerId,uid,output,pageFor,sessionFor,setOAuth,setPeopleFailure}) {
 const origin='http://127.0.0.1:3191';
 const personal=(await db.query('select id from public.workspaces where owner_id=$1 and is_personal',[joinerId])).rows[0].id;
 assert.notEqual(personal,wid);
 await member.goto(origin+'/settings');
 const section=member.locator('#workspaces');
 await section.locator('li').filter({hasText:'Мій особистий простір'}).waitFor();
 assert.equal(await section.locator('li').count(),2);
 await section.getByRole('button',{name:'Відкрити мій простір',exact:true}).click();
 await section.locator('li').filter({hasText:'Мій особистий простір'}).getByText('Поточний',{exact:true}).waitFor();
 assert.equal((await member.context().cookies()).find(c=>c.name==='shopik-workspace')?.value,personal);
 await member.goto(origin+'/');
 assert.equal(await member.getByRole('heading',{name:'Delete me',exact:true}).count(),0);
 await member.goto(origin+'/settings');
 await section.locator('li').filter({hasText:'Запрошений простір'}).getByRole('button',{name:'Відкрити простір',exact:true}).click();
 await section.locator('li').filter({hasText:'Запрошений простір'}).getByText('Поточний',{exact:true}).waitFor();
 await member.reload();
 assert.equal((await member.context().cookies()).find(c=>c.name==='shopik-workspace')?.value,wid);
 // Offline selection must not change a cookie or pretend that a workspace opened.
 await section.locator('li').filter({hasText:'Мій особистий простір'}).waitFor();
 await member.context().setOffline(true);
 await section.getByRole('button',{name:'Відкрити мій простір',exact:true}).click();
 await section.getByRole('alert').filter({hasText:'потрібне підключення'}).waitFor();
 assert.equal((await member.context().cookies()).find(c=>c.name==='shopik-workspace')?.value,wid);
 await member.context().setOffline(false);
 // The switcher has no dependency on the people request succeeding.
 setPeopleFailure(true);
 await member.reload();
 await member.locator('#members').getByRole('alert').waitFor();
 await section.locator('li').filter({hasText:'Мій особистий простір'}).waitFor();
 setPeopleFailure(false);
 // Explicit personal intent overrides the remembered shared space after OAuth.
 await member.goto(origin+'/login');
 await member.getByRole('heading',{name:'Спільний простір',exact:true}).waitFor();
 await member.getByRole('button',{name:'Відкрити мій простір',exact:true}).click();
 await member.getByRole('heading',{name:'Список покупок',exact:true}).waitFor();
 assert.equal((await member.context().cookies()).find(c=>c.name==='shopik-workspace')?.value,personal);
 await member.context().addCookies([{name:'shopik-workspace',value:wid,url:origin}]);
 await member.goto(origin+'/settings');
 await member.getByRole('button',{name:'Вийти',exact:true}).click();
 await member.getByRole('button',{name:'Увійти через Google',exact:true}).waitFor();
 await member.getByRole('button',{name:'Увійти через Google',exact:true}).click();
 await member.waitForURL(url=>url.pathname.includes('/auth/v1/authorize'));
 assert.equal(new URL(member.url()).searchParams.get('redirect_to'),origin+'/auth/callback?flow=personal');
 setOAuth(sessionFor(joinerId,'Invited user'));
 await member.goto(origin+'/auth/callback?code=fixture&flow=personal');
 await member.getByRole('heading',{name:'Список покупок',exact:true}).waitFor();
 assert.equal((await member.context().cookies()).find(c=>c.name==='shopik-workspace')?.value,personal);
 assert.equal(Number((await db.query('select count(*) n from public.workspaces where owner_id=$1 and is_personal',[joinerId])).rows[0].n),1);
 // Invited-only legacy accounts can recover a home directly from /login before entering the shell.
 const legacy=crypto.randomUUID();
 await db.query('insert into auth.users(id,email) values($1,$2)',[legacy,'legacy@example.invalid']);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'member')",[wid,legacy]);
 const legacyPage=await pageFor(sessionFor(legacy,'Legacy invited user'));
 await legacyPage.goto(origin+'/login');
 await legacyPage.getByRole('button',{name:'Відкрити мій простір',exact:true}).click();
 await legacyPage.getByRole('heading',{name:'Список покупок',exact:true}).waitFor();
 assert.equal(Number((await db.query('select count(*) n from public.workspaces where owner_id=$1 and is_personal',[legacy])).rows[0].n),1);
 // Paste validation never navigates to an external origin; valid input enters the existing preview flow.
 await owner.goto(origin+'/settings');
 await owner.getByRole('button',{name:'Запросити за посиланням',exact:true}).click();
 const field=owner.getByLabel('Нове посилання запрошення');await field.waitFor();const link=await field.inputValue();
 const guest=await pageFor(null);await guest.goto(origin+'/login');
 await guest.getByLabel('Посилання запрошення',{exact:true}).fill('https://evil.invalid/invite#token='+'A'.repeat(43));
 await guest.getByRole('button',{name:'Приєднатися за запрошенням',exact:true}).click();
 await guest.getByRole('alert').filter({hasText:'з цього сайту'}).waitFor();
 await guest.getByLabel('Посилання запрошення',{exact:true}).fill(link);
 await guest.getByRole('button',{name:'Приєднатися за запрошенням',exact:true}).click();
 await guest.waitForURL(origin+'/invite');
 await guest.getByRole('button',{name:'Увійти через Google',exact:true}).waitFor();
 assert.equal((await guest.context().cookies()).some(c=>c.name==='shopik-invite'&&c.httpOnly),true);
 // Native top-layer menu must remain visible even inside a deliberately clipping ancestor.
 const productCategory=(await db.query("select category_id from public.products where workspace_id=$1 and name='Delete me'",[wid])).rows[0].category_id;
 let layouts=0;
 for(const theme of ['light','dark','pink','light-blue','light-green','light-pink']){
  await db.query('update public.profiles set theme=$1 where id=$2',[theme,uid]);
  for(const width of [360,390,768,1440]){
   await owner.setViewportSize({width,height:850});await owner.goto(origin+'/?category='+productCategory);
   const trigger=owner.getByRole('button',{name:'Дії: Delete me',exact:true});await trigger.waitFor();
   await owner.locator('article').filter({has:trigger}).evaluate(el=>{el.style.overflow='hidden';el.style.transform='translateZ(0)';});
   await trigger.click();
   const menu=owner.getByLabel('Дії продукту',{exact:true});await menu.waitFor();
   const bounds=await menu.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=850);
   assert.equal(await menu.evaluate(el=>el.matches(':popover-open')),true);
   await menu.getByRole('button',{name:'Редагувати',exact:true}).focus();
   await owner.keyboard.press('ArrowDown');
   assert.equal(await menu.getByRole('button',{name:'Видалити',exact:true}).evaluate(el=>el===document.activeElement),true);
   await owner.keyboard.press('ArrowUp');
   assert.equal(await menu.getByRole('button',{name:'Редагувати',exact:true}).evaluate(el=>el===document.activeElement),true);
   assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await owner.screenshot({path:path.join(output,`product-menu-${theme}-${width}.png`),fullPage:true});
   await owner.keyboard.press('Escape');await menu.waitFor({state:'detached'});
   assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
   await trigger.click();await menu.getByRole('button',{name:'Редагувати',exact:true}).click();
   await owner.getByRole('dialog').waitFor();
   assert.equal(await owner.locator(':popover-open').count(),0);
   await owner.keyboard.press('Escape');
   layouts++;
  }
 }
 await member.goto(origin+'/settings');
 for(const width of [360,390,768,1440]){
  await member.setViewportSize({width,height:950});
  await section.getByRole('button',{name:'Відкрити мій простір',exact:true}).waitFor();
  assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await member.screenshot({path:path.join(output,`workspaces-${width}.png`),fullPage:true});
 }
 console.log(`PASS 016: invited-first personal space, switching/reload/logout/login, legacy recovery, independent list, paste validation, ${layouts} top-layer menu layouts`);
}
