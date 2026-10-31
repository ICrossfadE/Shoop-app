// Isolated production browser regression/benchmark. All Supabase traffic is
// redirected to a local PostgREST adapter backed by disposable PostgreSQL.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireRuntime = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.SHOPIK_SQL_MODULES || !process.env.SHOPIK_BROWSER_MODULES)
    throw new Error('Set SHOPIK_SQL_MODULES and SHOPIK_BROWSER_MODULES to isolated test node_modules directories.');
const { PGlite } = requireRuntime(path.join(process.env.SHOPIK_SQL_MODULES, '@electric-sql/pglite'));
const output = process.env.SHOPIK_CHECK_OUTPUT ? path.resolve(process.env.SHOPIK_CHECK_OUTPUT) : fs.mkdtempSync(path.join(os.tmpdir(), 'shopik-015-'));
fs.mkdirSync(output, { recursive: true });
const { chromium } = requireRuntime(path.join(process.env.SHOPIK_BROWSER_MODULES, 'playwright'));
const root = path.resolve(__dirname, '../..'), app = path.join(root, 'shopik-app');
const envText = fs.readFileSync(app + '/.env.local', 'utf8');
const realUrl = envText.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/m)[1].trim().replace(/^['"]|['"]$/g, '');
const uid = 'b8bc6ee0-9ddb-456a-8f41-637ec2719001', keypair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keypair.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const claims = { sub: uid, aud: 'authenticated', role: 'authenticated', iss: realUrl + '/auth/v1', iat: now, exp: now + 3600, email: 'fixture@example.invalid', user_metadata: { full_name: 'Fixture User' } };
const unsigned = enc({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }) + '.' + enc(claims);
const jwt = unsigned + '.' + crypto.sign('sha256', Buffer.from(unsigned), keypair.privateKey).toString('base64url');
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: claims.email, user_metadata: claims.user_metadata, app_metadata: { provider: 'google' } };
const session = { access_token: jwt, refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user };
let oauthSession=session;
let db, stats = [], wid, cid, homeId, failKind = '', loseKind = '', delay = 60, server;
async function database(baseline) {
    if (db)
        await db.close();
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$; create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
    for (const f of fs.readdirSync(root + '/supabase/migrations').sort()) {
        if (baseline && f.includes('202610300008'))
            continue;
        await db.exec(fs.readFileSync(root + '/supabase/migrations/' + f, 'utf8'));
    }
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [uid, user.email, user.user_metadata]);
    await db.transaction(async (t) => { await t.exec(`set local role authenticated; select set_config('request.jwt.claims','${JSON.stringify(claims)}',true);`); wid = (await t.query('select * from public.ensure_personal_workspace()')).rows[0].workspace_id; cid = (await t.query('select id from public.categories')).rows[0].id; await t.query("update public.categories set name='Їжа' where id=$1", [cid]); homeId = (await t.query("insert into public.categories(workspace_id,name) values($1,'Дім') returning id", [wid])).rows[0].id; await t.query("insert into public.products(workspace_id,category_id,name,price) values($1,$2,'Delete me',25)", [wid, cid]); await t.query("insert into public.products(workspace_id,category_id,name,price) values($1,$2,'Home item',10)", [wid, homeId]); });
    stats = [];
}
const sleep = n => new Promise(r => setTimeout(r, n));
async function startMock() {
    server = http.createServer(async (req, res) => {
        res.setHeader('content-type', 'application/json');
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.includes('/auth/v1/')) {
            if (url.pathname.endsWith('jwks.json'))
                res.end(JSON.stringify({ keys: [jwk] }));
            else if (url.pathname.endsWith('/token'))
                res.end(JSON.stringify(oauthSession));
            else if (url.pathname.endsWith('/user'))
                res.end(JSON.stringify(user));
            else if (url.pathname.includes('/logout'))
                res.end('{}');
            else
                res.end('{}');
            return;
        }
        const chunks = [];
        for await (const c of req)
            chunks.push(c);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
        const marker = { method: req.method, path: url.pathname, kind: body?.p_kind ?? '', ms: 0 };
        stats.push(marker);
        const start = performance.now();
        await sleep(delay);
        try {
            const requestClaims = JSON.parse(Buffer.from(req.headers.authorization.split(' ')[1].split('.')[1], 'base64url').toString());
            const data = await db.transaction(async (t) => {
                await t.exec(`set local role authenticated; select set_config('request.jwt.claims','${JSON.stringify(requestClaims)}',true);`);
                if (url.pathname.includes('/rpc/')) {
                    const name = url.pathname.split('/').pop();
                    if (!/^[a-z_]+$/.test(name))
                        throw Error('bad fn');
                    if (failKind && body.p_kind === failKind) {
                        failKind = '';
                        const e = new Error('Fixture denied');
                        e.code = '42501';
                        throw e;
                    }
                    if (name === 'ensure_personal_workspace')
                        return (await t.query('select * from public.ensure_personal_workspace()')).rows;
                    const keys = Object.keys(body), args = keys.map((k, i) => k + '=> $' + (i + 1)).join(',');
                    const q = await t.query(`select public.${name}(${args}) as data`, Object.values(body));
                    return q.rows[0].data;
                }
                const table = url.pathname.split('/').pop();
                if (!['products', 'categories', 'tags', 'profiles', 'workspace_members','workspaces'].includes(table))
                    throw Error('bad table ' + table);
                const values = [], conditions = [];
                for (const [k, v] of url.searchParams) {
                    if (['select', 'order', 'limit'].includes(k))
                        continue;
                    if (!/^[a-z_]+$/.test(k) || !v.startsWith('eq.'))
                        throw Error('bad filter');
                    values.push(v.slice(3));
                    conditions.push(k + '=$' + values.length);
                }
                const where = conditions.length ? ' where ' + conditions.join(' and ') : '';
                let sql;
                if (req.method === 'GET') {
                    const cols = url.searchParams.get('select') || '*';
                    if (!/^[a-z_,*]+$/.test(cols))
                        throw Error('bad cols');
                    sql = 'select ' + cols + ' from public.' + table + where;
                    const order = url.searchParams.get('order');
                    if (order) {
                        const orderSql = order.split(',').map(x => x.replace('.', ' ')).join(',');
                        if (!/^[a-z_, ]+$/.test(orderSql))
                            throw Error('bad order');
                        sql += ' order by ' + orderSql;
                    }
                }
                else if (req.method === 'PATCH') {
                    const sets = Object.entries(body).map(([k, v]) => { values.push(v); return k + '=$' + values.length; });
                    sql = 'update public.' + table + ' set ' + sets.join(',') + where + ' returning *';
                }
                else if (req.method === 'DELETE')
                    sql = 'delete from public.' + table + where + ' returning *';
                else if (req.method === 'POST') {
                    const keys = Object.keys(body);
                    values.push(...Object.values(body));
                    sql = 'insert into public.' + table + '(' + keys.join(',') + ') values(' + keys.map((_, i) => '$' + (i + 1)).join(',') + ') returning *';
                }
                else
                    throw Error('bad method');
                const q = await t.query(sql, values);
                return req.headers.accept?.includes('vnd.pgrst.object') ? q.rows[0] ?? null : q.rows;
            });
            marker.ms = performance.now() - start;
            if (loseKind && body?.p_kind === loseKind) {
                loseKind = '';
                res.statusCode = 504;
                res.end(JSON.stringify({ code: '504', message: 'Fixture lost response' }));
            }
            else
                res.end(JSON.stringify(data));
        }
        catch (e) {
            marker.ms = performance.now() - start;
            console.log('MOCK ERROR', url.pathname, e.code, e.message);
            res.statusCode = 400;
            res.end(JSON.stringify({ code: e.code ?? 'XX000', message: e.message, details: e.where ?? '' }));
        }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3190, '127.0.0.1', resolve); });
}
const shim = path.join(output, 'fetch-shim.cjs');
fs.writeFileSync(shim, `const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(url.startsWith(${JSON.stringify(realUrl)})){input='http://127.0.0.1:3190'+url.slice(${realUrl.length});}return originalFetch(input,init)};`);
// Signed fixture sessions and mocked OAuth are confined to the isolated local adapter.
const joinerId='01500000-0000-4000-8000-000000009002';
const strangerId='01500000-0000-4000-8000-000000009003';
function sessionFor(id,name){const c={...claims,sub:id,email:id+'@example.invalid',user_metadata:{full_name:name}};const u=enc({alg:'RS256',kid:'test-key',typ:'JWT'})+'.'+enc(c);return {...session,access_token:u+'.'+crypto.sign('sha256',Buffer.from(u),keypair.privateKey).toString('base64url'),user:{...user,id,email:c.email,user_metadata:c.user_metadata}};}
async function mainInvites(){
 await database(false);
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3),($4,$5,$6)',[joinerId,'joiner@example.invalid',{full_name:'Invited user'},strangerId,'stranger@example.invalid',{full_name:'Other account'}]);
 await startMock();
 const child=spawn(process.execPath,['--require',shim,app+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3191'],{cwd:app,env:{...process.env,NODE_PATH:app+'/node_modules'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let browser;const errors=[];const secrets=[];let leakedUrl=false;
 try{
  let ready=false;for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:3191/login');ready=true;break;}catch{await sleep(200);}if(child.exitCode!==null)throw Error(logs);}assert.ok(ready);
  browser=await chromium.launch({channel:'msedge',headless:true});
  async function pageFor(auth){
   const context=await browser.newContext({viewport:{width:390,height:950}});
   if(auth)await context.addCookies([{name:'sb-'+new URL(realUrl).hostname.split('.')[0]+'-auth-token',value:'base64-'+enc(auth),url:'http://127.0.0.1:3191',sameSite:'Lax'}]);
   const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
   page.on('request',request=>{if(secrets.some(token=>request.url().includes(token)||Object.entries(request.headers()).some(([key,value])=>key==='referer'&&value.includes(token))))leakedUrl=true;});
   await page.route(realUrl+'/**',async route=>{
    if(route.request().url().includes('/auth/v1/authorize')){
      const authUrl=new URL(route.request().url());assert.equal(authUrl.searchParams.get('redirect_to'),'http://127.0.0.1:3191/auth/callback?flow=invite');
      await route.fulfill({body:'<!doctype html><title>Isolated OAuth fixture</title>',contentType:'text/html'});return;
    }
    const response=await route.fetch({url:route.request().url().replace(realUrl,'http://127.0.0.1:3190')});await route.fulfill({response});
   });return page;
  }
  const owner=await pageFor(session);
  await owner.goto('http://127.0.0.1:3191/settings');
  async function createLink(){await owner.getByRole('button',{name:'Запросити за посиланням',exact:true}).click();const field=owner.getByLabel('Нове посилання запрошення');await field.waitFor();const value=await field.inputValue();const token=new URLSearchParams(new URL(value).hash.slice(1)).get('token');assert.ok(/^[A-Za-z0-9_-]{43}$/.test(token));secrets.push(token);return {value,token};}
  const first=await createLink();
  await owner.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Fixture clipboard disabled');}}});});
  await owner.getByRole('button',{name:'Копіювати посилання',exact:true}).click();
  await owner.getByRole('status').filter({hasText:'Скопіюйте посилання вручну'}).waitFor();
  assert.equal(await owner.getByLabel('Нове посилання запрошення').inputValue(),first.value);
  // Reload hides the secret but preserves owner-safe metadata.
  await owner.reload();await owner.getByRole('button',{name:'Запросити за посиланням',exact:true}).waitFor();
  assert.equal(await owner.locator('#invite-link').count(),0);
  await owner.screenshot({path:path.join(output,'owner-invites-390.png'),fullPage:true});
  const anonymous=await pageFor();
  const response=await anonymous.goto(first.value);
  assert.match(response.headers()['cache-control'],/no-store/);assert.equal(response.headers()['referrer-policy'],'no-referrer');assert.match(response.headers()['x-robots-tag'],/noindex/);
  await anonymous.getByRole('button',{name:'Увійти через Google',exact:true}).waitFor();
  assert.equal(new URL(anonymous.url()).hash,'');
  const intent=(await anonymous.context().cookies()).find(cookie=>cookie.name==='shopik-invite');assert.ok(intent?.httpOnly);assert.equal(intent.path,'/invite');
  assert.equal(await anonymous.evaluate(()=>document.cookie.includes('shopik-invite')),false);
  assert.equal((await db.query('select count(*)::int n from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,joinerId])).rows[0].n,0);
  await anonymous.reload();await anonymous.getByRole('button',{name:'Увійти через Google',exact:true}).waitFor();
  await anonymous.screenshot({path:path.join(output,'invite-login-390.png'),fullPage:true});
  // OAuth rejection returns to the fixed invite route and retains the short-lived context.
  await anonymous.goto('http://127.0.0.1:3191/auth/callback?flow=invite&error=access_denied');
  await anonymous.getByRole('alert').filter({hasText:'Вхід не завершено'}).waitFor();
  await anonymous.waitForFunction(()=>!document.querySelector('main')?.textContent.includes('Перевіряємо посилання'));
  await anonymous.getByRole('button',{name:'Увійти через Google',exact:true}).click();
  await anonymous.waitForURL(url=>url.pathname.includes('/auth/v1/authorize'));
  oauthSession=sessionFor(joinerId,'Invited user');
  await anonymous.goto('http://127.0.0.1:3191/auth/callback?code=fixture&flow=invite');
  await anonymous.getByRole('button',{name:'Приєднатися до простору',exact:true}).waitFor();
  assert.equal((await db.query('select count(*)::int n from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,joinerId])).rows[0].n,0,'OAuth and preview must not consume invite');
  await anonymous.getByRole('button',{name:'Приєднатися до простору',exact:true}).click();
  await anonymous.getByRole('heading',{name:'Список покупок',exact:true}).waitFor();
  assert.equal((await db.query('select role from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,joinerId])).rows[0].role,'member');
  assert.equal((await anonymous.context().cookies()).find(cookie=>cookie.name==='shopik-workspace')?.value,wid);
  assert.equal((await anonymous.context().cookies()).some(cookie=>cookie.name==='shopik-invite'),false);
  assert.equal(await anonymous.getByRole('button',{name:'Дії: Delete me',exact:true}).count(),0);
  const stored=await anonymous.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('shopik-local',1);r.onsuccess=()=>{const d=r.result;const q=d.transaction('records').objectStore('records').getAll();q.onsuccess=()=>{resolve(JSON.stringify(q.result));d.close();};};}));
  assert.equal(secrets.some(token=>stored.includes(token)),false);
  await anonymous.goto('http://127.0.0.1:3191/settings');
  await anonymous.getByRole('heading',{name:'Учасники простору',exact:true}).waitFor();
  assert.equal(await anonymous.getByRole('button',{name:'Запросити за посиланням',exact:true}).count(),0);
  // Existing members do not consume the next link; other accounts see revocation/used states only.
  const second=await createLink();
  await anonymous.goto(second.value);await anonymous.getByText('Ви вже учасник цього простору.',{exact:true}).waitFor();
  assert.equal((await db.query('select accepted_at from public.workspace_invites where token_hash=$1',[crypto.createHash('sha256').update(second.token).digest('hex')])).rows[0].accepted_at,null);
  owner.once('dialog',d=>d.accept());await owner.getByRole('button',{name:'Відкликати',exact:true}).click();
  const other=await pageFor(sessionFor(strangerId,'Other account'));
  await other.goto(second.value);await other.getByRole('alert').filter({hasText:'відкликав'}).waitFor();
  await other.goto(first.value);await other.getByRole('alert').filter({hasText:'вже використане'}).waitFor();
  await other.goto('http://127.0.0.1:3191/invite#token=bad');await other.getByRole('alert').filter({hasText:'Посилання недійсне'}).waitFor();assert.equal(new URL(other.url()).hash,'');
  const preview=await createLink();
  // Simulate a transport failure: the invitation remains retryable with no automatic membership write.
  await other.goto(preview.value);await other.getByRole('button',{name:'Приєднатися до простору',exact:true}).waitFor();
  await other.route('**/invite',async route=>{if(route.request().method()==='POST'){await route.abort();await other.unroute('**/invite');}else await route.continue();});
  await other.getByRole('button',{name:'Приєднатися до простору',exact:true}).click();
  await other.getByRole('button',{name:'Повторити перевірку',exact:true}).waitFor();
  await other.getByRole('button',{name:'Повторити перевірку',exact:true}).click();
  await other.getByRole('button',{name:'Приєднатися до простору',exact:true}).waitFor();
  assert.equal((await db.query('select count(*)::int n from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,strangerId])).rows[0].n,0);
  let layouts=0;
  for(const theme of ['light','dark','pink','light-blue','light-green','light-pink']){
   await db.query('update public.profiles set theme=$1 where id=$2',[theme,strangerId]);
   for(const width of [360,390,768,1440]){
    await other.setViewportSize({width,height:950});await other.goto(preview.value);
    await other.getByRole('button',{name:'Приєднатися до простору',exact:true}).waitFor();
    assert.equal(await other.locator('html').getAttribute('data-theme'),theme);
    assert.equal(await other.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await other.getByRole('button',{name:'Приєднатися до простору',exact:true}).focus();
    assert.ok(await other.getByRole('button',{name:'Приєднатися до простору',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44));
    await other.screenshot({path:path.join(output,`invite-${theme}-${width}.png`),fullPage:true});layouts++;
   }
  }
  // Drop a successful create response: retry returns metadata, never a second secret or row.
  const beforeLost=Number((await db.query('select count(*) n from public.workspace_invites where workspace_id=$1',[wid])).rows[0].n);
  await owner.route('**/settings',async route=>{if(route.request().method()==='POST'){await route.fetch();await route.abort();await owner.unroute('**/settings');}else await route.continue();});
  await owner.getByRole('button',{name:'Запросити за посиланням',exact:true}).click();
  await owner.getByRole('alert').filter({hasText:'Результат невідомий'}).waitFor();
  await owner.getByRole('button',{name:'Запросити за посиланням',exact:true}).click();
  await owner.getByRole('status').filter({hasText:'Секрет не відновлюється'}).waitFor();
  assert.equal(Number((await db.query('select count(*) n from public.workspace_invites where workspace_id=$1',[wid])).rows[0].n),beforeLost+1);
  assert.equal(await owner.locator('#invite-link').count(),0);
  owner.once('dialog',dialog=>dialog.accept());
  await owner.locator('li').filter({hasText:'Ваш останній запит'}).getByRole('button',{name:'Відкликати',exact:true}).click();
  await owner.getByRole('status').filter({hasText:'Стан запрошення оновлено'}).waitFor();
  assert.equal(leakedUrl,false,'Invitation secret appeared in network URL/referrer');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,isolated:true,layouts,oauth:'local token-exchange fixture, not hosted Google',scenarios:['owner create/copy fallback/list/revoke','fragment scrub and private cookie','OAuth denial and fixed continuation','explicit member acceptance and workspace selection','existing member does not consume','used/revoked/invalid','network retry','no token in IndexedDB or network URL/referrer']},null,2));
  console.log('PASS: invitation production flow, isolated OAuth continuation, owner controls, private context, retries, 24 theme/width layouts and preserved permissions');
 }catch(error){fs.writeFileSync(path.join(output,'server.log'),logs);throw error;}
 finally{await browser?.close();child.kill();await new Promise(resolve=>server.close(resolve));await db.close();}
}
mainInvites().catch(error=>{console.error(error);process.exitCode=1;});
