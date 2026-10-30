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
            const data = await db.transaction(async (t) => {
                await t.exec(`set local role authenticated; select set_config('request.jwt.claims','${JSON.stringify(claims)}',true);`);
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
                if (!['products', 'categories', 'tags', 'profiles', 'workspace_members'].includes(table))
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
const result = [];
async function run(baseline) {
    await database(baseline);
    const cwd = baseline ? path.resolve(process.env.SHOPIK_BASELINE_APP || (() => { throw new Error('Set SHOPIK_BASELINE_APP to the preserved baseline production build.'); })()) : app;
    const child = spawn(process.execPath, ['--require', shim, app + '/node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3191'], { cwd, env: { ...process.env, NODE_PATH: app + '/node_modules' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout.on('data', b => logs += b);
    child.stderr.on('data', b => logs += b);
    fs.writeFileSync(path.join(output, 'next-check.pid'), String(child.pid));
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        let ready = false;
        for (let i = 0; i < 80; i++) {
            if (child.exitCode !== null) throw new Error('Test server exited: ' + logs);
            try {
                await fetch('http://127.0.0.1:3191/login');
                ready = true;
                break;
            }
            catch {
                await sleep(200);
            }
        }
        if (!ready)
            throw Error('Server not ready ' + logs);
        const context = await browser.newContext();
        await context.addCookies([{ name: 'sb-' + new URL(realUrl).hostname.split('.')[0] + '-auth-token', value: 'base64-' + enc(session), url: 'http://127.0.0.1:3191', sameSite: 'Lax' }]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route(realUrl + '/**', async (route) => { const response = await route.fetch({ url: route.request().url().replace(realUrl, 'http://127.0.0.1:3190') }); await route.fulfill({ response }); });
        await page.goto('http://127.0.0.1:3191/?category=' + cid);
        await page.getByRole('heading', { name: 'Список покупок', exact: true }).waitFor();
        await page.waitForTimeout(baseline ? 200 : 1200);
        const settled = async () => { await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role=status]')).some(el => /Зберігається|Оновлюємо дані|Збереження/.test(el.textContent))); await page.waitForTimeout(120); };
        const measure = async (name, action) => { stats = []; const started = performance.now(); await action(); await settled(); result.push({ version: baseline ? 'before' : 'after', operation: name, elapsedMs: Math.round(performance.now() - started), requests: stats.length, paths: stats.map(x => x.method + ' ' + x.path + (x.kind ? ' ' + x.kind : '')) }); fs.writeFileSync(path.join(output, 'benchmark-' + (baseline ? 'before' : 'after') + '.json'), JSON.stringify(result, null, 2)); console.log(result.at(-1).version, name, result.at(-1).requests, result.at(-1).elapsedMs); };
        await measure('create', async () => { await page.getByRole('button', { name: 'Додати продукт', exact: true }).click(); await page.getByRole('dialog').getByLabel('Назва', { exact: true }).fill('Measured'); await page.getByLabel('Ціна, грн').fill('50'); await page.getByRole('button', { name: 'Зберегти', exact: true }).click(); await page.getByRole('heading', { name: 'Measured', exact: true }).waitFor(); if (!baseline)
            assert.ok(!stats.some(x => x.kind === 'save_product' && x.ms > 0), 'Optimistic card must precede server response'); });
        await measure('edit', async () => { const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Measured', exact: true }) }); await card.getByRole('button', { name: 'Дії: Measured', exact: true }).click(); await page.getByRole('button', { name: 'Редагувати', exact: true }).click(); await page.getByRole('dialog').getByLabel('Назва', { exact: true }).fill('Measured edited'); await page.getByRole('button', { name: 'Зберегти', exact: true }).click(); await page.getByRole('heading', { name: 'Measured edited', exact: true }).waitFor(); });
        await measure('complete', async () => { await page.getByRole('button', { name: 'Завершити Measured edited', exact: true }).click(); await page.getByRole('heading', { name: 'Measured edited', exact: true }).waitFor({ state: 'hidden' }); });
        await measure('delete', async () => { await page.getByRole('button', { name: 'Дії: Delete me', exact: true }).click(); await page.getByRole('button', { name: 'Видалити', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click(); await page.getByRole('heading', { name: 'Delete me', exact: true }).waitFor({ state: 'hidden' }); });
        await measure('category first visit', async () => { await page.getByRole('button', { name: 'Дім', exact: true }).click(); await page.getByRole('heading', { name: 'Home item', exact: true }).waitFor(); });
        await measure('category cached return', async () => { await page.getByRole('button', { name: 'Їжа', exact: true }).click(); await page.getByRole('button', { name: 'Їжа', exact: true }).waitFor(); });
        if (!baseline) {
            await page.goBack();
            await page.getByRole('heading', { name: 'Home item', exact: true }).waitFor();
            await page.goForward();
            await settled();
        }
        if (!baseline) {
            const navigation = [];
            const requests = [];
            const track = request => { if (request.isNavigationRequest() || request.url().includes('_rsc=')) requests.push(request.url()); };
            page.on('request', track);
            const header = await page.locator('header').elementHandle();
            for (const [label, heading] of [['Налаштування акаунта: Fixture User', 'Налаштування акаунта'], ['Витрати', 'Витрати'], ['Список покупок', 'Список покупок']]) {
                const started = performance.now();
                await page.getByRole('link', { name: label, exact: true }).click();
                await page.getByRole('heading', { name: heading, exact: true }).waitFor();
                navigation.push({ heading, ms: Math.round(performance.now() - started) });
                if (heading === 'Витрати') await page.waitForFunction(() => document.querySelector('.donut-center strong')?.textContent.includes('50,00'));
                assert.equal(await header.evaluate(node => node.isConnected), true, 'Header must remain mounted');
            }
            stats = [];
            for (const label of ['Налаштування акаунта: Fixture User', 'Витрати', 'Список покупок']) await page.getByRole('link', { name: label, exact: true }).click();
            await page.waitForTimeout(150);
            assert.equal(stats.length, 0, 'Fresh screen cycle must not read Supabase again');
            assert.equal(requests.length, 0, 'Screen switching must not request server pages');
            page.off('request', track);
            fs.writeFileSync(path.join(output, 'navigation.json'), JSON.stringify(navigation, null, 2));
            console.log('PASS shared shell navigation without RSC/document requests', JSON.stringify(navigation));
        }
        await page.goto('http://127.0.0.1:3191/expenses');
        await page.getByRole('heading', { name: 'Витрати', exact: true }).waitFor();
        await measure('expense month first visit', async () => { await page.locator('#expense-month').fill('2025-01'); await page.getByRole('button', { name: 'Показати', exact: true }).click(); await page.getByRole('region', { name: 'Підсумок місяця 2025-01' }).waitFor(); });
        const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit' }).format(new Date());
        const current = month.includes('/') ? month.split('/').reverse().join('-') : month;
        await measure('expense month cached return', async () => { await page.locator('#expense-month').fill(current); await page.getByRole('button', { name: 'Показати', exact: true }).click(); await page.getByRole('heading', { name: 'Measured edited', exact: true }).waitFor(); });
        if (!baseline) {
            await page.goto('http://127.0.0.1:3191/?category=' + cid);
            await page.getByRole('button', { name: 'Додати продукт', exact: true }).click();
            await page.getByRole('dialog').getByLabel('Назва', { exact: true }).fill('Retry once');
            loseKind = 'save_product';
            await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
            await page.getByRole('heading', { name: 'Retry once', exact: true }).waitFor();
            await page.getByRole('link', { name: 'Витрати', exact: true }).click();
            await page.getByRole('dialog').getByRole('alert').waitFor();
            await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
            await page.getByRole('dialog').waitFor({ state: 'hidden' });
            await settled();
            const count = await db.query("select count(*) n from public.products where name='Retry once'");
            assert.equal(Number(count.rows[0].n), 1);
            console.log('PASS lost response retry and draft across client navigation');
            await page.goto('http://127.0.0.1:3191/?category=' + cid);
            await page.getByRole('button', { name: 'Додати продукт', exact: true }).click();
            await page.getByRole('dialog').getByLabel('Назва', { exact: true }).fill('Denied draft');
            failKind = 'save_product';
            await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
            await page.getByRole('dialog').getByRole('alert').waitFor();
            assert.equal(await page.getByRole('dialog').getByLabel('Назва', { exact: true }).inputValue(), 'Denied draft');
            assert.equal(await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Denied draft', exact: true }) }).count(), 0);
            await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
            console.log('PASS RLS rollback and draft');
            delay = 300;
            for (const name of ['Parallel A', 'Parallel B']) {
                await page.getByRole('button', { name: 'Додати продукт', exact: true }).click();
                await page.getByRole('dialog').getByLabel('Назва', { exact: true }).fill(name);
                await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
                await page.getByRole('heading', { name, exact: true }).waitFor();
                assert.equal(await page.getByRole('button', { name: 'Додати продукт', exact: true }).isEnabled(), true);
            }
            await page.getByRole('button', { name: 'Дім', exact: true }).click();
            await page.getByRole('heading', { name: 'Home item', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Їжа', exact: true }).click();
            await settled();
            assert.equal(await page.getByRole('heading', { name: 'Parallel A', exact: true }).count(), 1);
            assert.equal(await page.getByRole('heading', { name: 'Parallel B', exact: true }).count(), 1);
            delay = 60;
            console.log('PASS independent pending operations and filter navigation');
            loseKind = 'products';
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await page.getByRole('alert').filter({ hasText: 'останній збережений список' }).waitFor();
            assert.equal(await page.getByRole('heading', { name: 'Parallel A', exact: true }).count(), 1);
            await page.getByRole('button', { name: 'Спробувати знову', exact: true }).click();
            await settled();
            console.log('PASS background read failure retains data');
            await page.goto('http://127.0.0.1:3191/expenses');
            page.once('dialog', d => d.accept());
            await page.getByRole('button', { name: 'Видалити', exact: true }).click();
            await page.getByRole('heading', { name: 'Measured edited', exact: true }).waitFor({ state: 'hidden' });
            await settled();
            assert.match(await page.locator('.donut-center strong').textContent(), /0,00/);
            console.log('PASS expense optimistic total');
            await page.goto('http://127.0.0.1:3191/settings');
            await page.locator('#tag-name').fill('Browser tag');
            await page.getByRole('button', { name: 'Створити тег', exact: true }).click();
            await page.locator('section[aria-labelledby=workspace-tags] li').filter({ hasText: 'Browser tag' }).waitFor();
            await settled();
            assert.equal(await page.locator('section[aria-labelledby=workspace-tags] li').filter({ hasText: 'Browser tag' }).count(), 1);
            await page.getByText('Керування категоріями', { exact: true }).click();
            await page.locator('#category-name').fill('Browser category');
            await page.getByRole('button', { name: 'Створити категорію', exact: true }).click();
            await settled();
            await page.locator('#categories li').filter({ hasText: 'Browser category' }).waitFor();
            assert.equal(await page.locator('#categories li').filter({ hasText: 'Browser category' }).count(), 1);
            page.once('dialog', d => d.accept());
            await page.locator('#categories li').filter({ hasText: 'Дім' }).getByRole('button', { name: 'Видалити', exact: true }).click();
            await page.locator('#categories [role=alert]').waitFor();
            assert.equal(await page.locator('#categories li').filter({ hasText: 'Дім' }).count(), 1);
            console.log('PASS tags/categories and nonempty rollback');
            await page.getByRole('link', { name: 'Список покупок', exact: true }).click();
            await page.getByRole('button', { name: 'Browser category', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Додати продукт', exact: true }).click();
            await page.getByRole('dialog').getByText('Browser tag', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
            await page.getByRole('link', { name: 'Налаштування акаунта: Fixture User', exact: true }).click();
            await page.locator('#tag-name').fill('Unsubmitted draft');
            await page.getByRole('link', { name: 'Список покупок', exact: true }).click();
            await page.getByRole('link', { name: 'Налаштування акаунта: Fixture User', exact: true }).click();
            assert.equal(await page.locator('#tag-name').inputValue(), 'Unsubmitted draft');
            console.log('PASS canonical metadata and settings draft across screens');
            await page.setViewportSize({ width: 390, height: 900 });
            await page.screenshot({ path: path.join(output, 'settings-after.png'), fullPage: true });
        }
        if (baseline)
            console.log('BASELINE hydration errors', errors.length);
        else
            assert.deepEqual(errors, []);
        console.log('PASS browser', baseline ? 'before' : 'after');
    }
    catch (e) {
        console.error(logs.slice(-4000));
        throw e;
    }
    finally {
        if (browser) await browser.close();
        child.kill();
        await sleep(500);
    }
}
(async () => { await startMock(); try {
    if (process.argv.includes('--before'))
        await run(true);
    else if (process.argv.includes('--both')) {
        await run(true);
        await run(false);
    }
    else
        await run(false);
    fs.writeFileSync(path.join(output, 'benchmark' + (process.argv.includes('--before') ? '-before' : '-after') + '.json'), JSON.stringify(result, null, 2));
}
finally {
    server.close();
    if (db)
        await db.close();
} })().catch(e => { console.error(e); process.exitCode = 1; });
