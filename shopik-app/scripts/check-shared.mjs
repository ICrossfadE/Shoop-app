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
const output = process.env.SHOPIK_CHECK_OUTPUT ? path.resolve(process.env.SHOPIK_CHECK_OUTPUT) : fs.mkdtempSync(path.join(os.tmpdir(), 'shopik-008-009-'));
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
// Test identities are signed with the isolated JWKS key; no real accounts or cloud writes.
const targetId='01100000-0000-4000-8000-000000000002';
const otherId='01100000-0000-4000-8000-000000000003';
function testSession(id,name){
 const c={...claims,sub:id,email:`${id}@example.invalid`,user_metadata:{full_name:name}};
 const unsigned=enc({alg:'RS256',kid:'test-key',typ:'JWT'})+'.'+enc(c);
 const token=unsigned+'.'+crypto.sign('sha256',Buffer.from(unsigned),keypair.privateKey).toString('base64url');
 return {...session,access_token:token,user:{...user,id,email:c.email,user_metadata:c.user_metadata}};
}
// Execute fixture SQL as the chosen authenticated identity, preserving actual RLS.
async function asUser(id,sql,params=[]){return db.transaction(async t=>{await t.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({...claims,sub:id})]);await t.exec('set local role authenticated');return t.query(sql,params);});}
async function runShared(){
 await database(false);
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3),($4,$5,$6)',[targetId,'target@example.invalid',{full_name:'Removed author'},otherId,'other@example.invalid',{full_name:'Other member'}]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'member'),($1,$3,'member')",[wid,targetId,otherId]);
 const targetCategory=(await asUser(targetId,"insert into public.categories(workspace_id,name) values($1,'Target shared') returning id",[wid])).rows[0].id;
 const historical=(await asUser(targetId,"select public.save_product_tags($1,null,'Archived target','',50,$2,'{}') id",[wid,targetCategory])).rows[0].id;
 await asUser(otherId,"update public.products set status='completed' where id=$1",[historical]);
 const otherProduct=(await asUser(otherId,"select public.save_product_tags($1,null,'Other active','',20,$2,'{}') id",[wid,targetCategory])).rows[0].id;
 const liveTarget=(await asUser(targetId,"select public.save_product_tags($1,null,'Target active','',15,$2,'{}') id",[wid,cid])).rows[0].id;
 const joined=(await db.query('select created_at from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,targetId])).rows[0].created_at;
 const before=(await db.query('select sum(amount)::text total from public.expenses where workspace_id=$1',[wid])).rows[0].total;
 await startMock();
 const child=spawn(process.execPath,['--require',shim,app+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3191'],{cwd:app,env:{...process.env,NODE_PATH:app+'/node_modules'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs=''; child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let browser;
 try{
  for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:3191/login');break;}catch{await sleep(200);}if(child.exitCode!==null)throw Error(logs);}
  browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[];
  async function open(sessionData){
   const ctx=await browser.newContext({viewport:{width:390,height:900}});
   await ctx.addCookies([{name:'sb-'+new URL(realUrl).hostname.split('.')[0]+'-auth-token',value:'base64-'+enc(sessionData),url:'http://127.0.0.1:3191',sameSite:'Lax'}, {name:'shopik-workspace',value:wid,url:'http://127.0.0.1:3191',httpOnly:true}]);
   const page=await ctx.newPage();await page.emulateMedia({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
   await page.route(realUrl+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(realUrl,'http://127.0.0.1:3190')});await route.fulfill({response});});
   await page.goto('http://127.0.0.1:3191/?category='+cid);
   await page.getByRole('heading',{name:'Target active',exact:true}).waitFor();
   return page;
  }
  const owner=await open(session);
  assert.equal(await owner.getByRole('button',{name:'Дії: Target active',exact:true}).count(),0);
  assert.equal(await owner.getByRole('button',{name:'Дії: Delete me',exact:true}).count(),1);
  await owner.getByRole('button',{name:'Завершити Target active',exact:true}).click();
  await owner.getByRole('heading',{name:'Target active',exact:true}).waitFor({state:'hidden'});
  // Restore the active fixture so the target page has an unbought product too.
  const targetForPage=(await asUser(targetId,"select public.save_product_tags($1,null,'Target active','',15,$2,'{}') id",[wid,cid])).rows[0].id;
  const target=await open(testSession(targetId,'Removed author'));
  await target.getByRole('button',{name:'Додати продукт',exact:true}).click();
  await target.getByRole('dialog').getByLabel('Назва',{exact:true}).fill('Revoked draft');
  await target.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('shopik-local',1);r.onsuccess=()=>{const d=r.result;const q=d.transaction('records').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result.some(x=>x.key.startsWith('draft:')));d.close();};};}));
  await owner.goto('http://127.0.0.1:3191/settings');
  await owner.getByRole('heading',{name:'Учасники простору',exact:true}).waitFor();
  const members=owner.locator('#members');
  await members.locator('li').filter({hasText:'Removed author'}).waitFor();
  const foreignCategory=owner.locator('#categories li').filter({hasText:'Target shared'});
  assert.equal(await foreignCategory.getByRole('button',{name:'Редагувати',exact:true}).count(),0);
  await owner.screenshot({path:path.join(output,'settings-before-removal-390.png'),fullPage:true});
  owner.once('dialog',d=>d.accept());
  await members.locator('li').filter({hasText:'Removed author'}).getByRole('button',{name:'Виключити',exact:true}).click();
  await members.locator('li').filter({hasText:'Removed author'}).waitFor({state:'hidden'});
  await foreignCategory.getByRole('button',{name:'Редагувати',exact:true}).waitFor();
  assert.equal((await db.query('select count(*)::int n from public.products where id=any($1)',[[historical,liveTarget,targetForPage]])).rows[0].n,0);
  assert.equal((await db.query('select category_id from public.products where id=$1',[otherProduct])).rows[0].category_id,targetCategory);
  const after=(await db.query('select sum(amount)::text total from public.expenses where workspace_id=$1',[wid])).rows[0].total;
  assert.equal(Number(after),Number(before)+15);
  await target.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await target.waitForURL('**/login');
  const retained=await target.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('shopik-local',1);r.onsuccess=()=>{const d=r.result;const q=d.transaction('records').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result);d.close();};};}));
  assert.equal(retained.some(record=>record.owner===targetId),false);
  await owner.goto('http://127.0.0.1:3191/expenses');
  await owner.getByRole('heading',{name:'Archived target',exact:true}).waitFor();
  const archived=owner.locator('.expense-row').filter({hasText:'Archived target'});
  assert.equal(await archived.getByRole('button',{name:'Видалити',exact:true}).count(),0);
  await archived.getByText('Removed author',{exact:true}).waitFor();
  await owner.screenshot({path:path.join(output,'archived-expenses-390.png'),fullPage:true});
  await owner.setViewportSize({width:1440,height:1000});
  await owner.screenshot({path:path.join(output,'archived-expenses-1440.png'),fullPage:true});
  await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_at) values($1,$2,'member',clock_timestamp()+interval '1 second')",[wid,targetId]);
  await assert.rejects(asUser(uid,'select public.remove_workspace_member($1,$2,$3)',[wid,targetId,joined]));
  // Switch only among actual memberships; the cookie alone must never grant access.
  await target.goto('http://127.0.0.1:3191/settings');
  const chooser=target.locator('#workspace-choice');await chooser.waitFor();
  const privateId=await chooser.locator('option').evaluateAll((items,current)=>items.find(item=>item.value!==current)?.value,wid);
  assert.ok(privateId);await chooser.selectOption(privateId);
  await target.getByRole('button',{name:'Відкрити простір',exact:true}).click();
  await target.waitForFunction(id=>document.querySelector('#workspace-choice')?.value===id,privateId);
  await target.waitForFunction(()=>document.querySelectorAll('#members li').length===1);
  const cookies=await target.context().cookies();assert.equal(cookies.find(cookie=>cookie.name==='shopik-workspace')?.value,privateId);
  await target.goto('http://127.0.0.1:3191/');
  assert.equal(await target.getByRole('heading',{name:'Other active',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: production author controls, shared completion, owner eviction, category transfer, archived author/history, revoked cache+draft cleanup and rejoin protection');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,scenario:'shared-permissions',isolated:true,screenshots:3},null,2));
 }catch(error){fs.writeFileSync(path.join(output,'server.log'),logs);throw error;}
 finally{await browser?.close();child.kill();await new Promise(resolve=>server.close(resolve));await db.close();}
}
runShared().catch(error=>{console.error(error);process.exitCode=1;});
