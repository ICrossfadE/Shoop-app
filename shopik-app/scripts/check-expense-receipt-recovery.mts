import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Use the existing disposable PostgreSQL runtime; never connect to hosted Supabase.
const requireRuntime = createRequire(import.meta.url);
const modules = process.env.SHOPIK_SQL_MODULES;
if (!modules) throw new Error('Set SHOPIK_SQL_MODULES to the existing isolated node_modules directory.');
const { PGlite } = requireRuntime(path.join(modules, '@electric-sql/pglite'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase');
const repairName = '202611030016_expense_price_receipts_repair.sql';
const repair = fs.readFileSync(path.join(root, 'migrations', repairName), 'utf8');

// Compare a complete installation with the exact missing-013 state reported by the user.
async function checkRecovery(skip013: boolean) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
    for (const file of fs.readdirSync(path.join(root, 'migrations')).filter(file => file.endsWith('.sql')).sort()) {
      if (file === repairName || (skip013 && file === '202611010013_expense_price.sql')) continue;
      await db.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
    }
    if (skip013) {
      await assert.rejects(db.exec(fs.readFileSync(path.join(root, 'tests/shopping_workflow.sql'), 'utf8')), { code: '42P01' });
      await db.exec('rollback');
      console.log('PASS reproduction: migration 015 without 013 fails with 42P01');
    } else {
      // A repeat repair must not erase retry identities that have already committed.
      await db.exec(`insert into auth.users(id,email) values('01600000-0000-4000-8000-000000000001','recovery@example.invalid');
        select set_config('request.jwt.claims','{"sub":"01600000-0000-4000-8000-000000000001"}',false);
        set role authenticated; select * from public.ensure_personal_workspace(); reset role;
        insert into shopik_private.expense_price_receipts(user_id,workspace_id,operation_id,payload_hash)
          select user_id,workspace_id,'01600000-0000-4000-8000-000000000002','preserve-existing-hash'
          from public.workspace_members where user_id='01600000-0000-4000-8000-000000000001';`);
    }
    await db.exec(repair);
    await db.exec(repair);
    const access = (await db.query(`select
      has_table_privilege('authenticated','shopik_private.expense_price_receipts','select') member_read,
      has_table_privilege('authenticated','shopik_private.expense_price_receipts','insert') member_write,
      has_table_privilege('anon','shopik_private.expense_price_receipts','select') anon_read,
      has_function_privilege('anon','public.correct_expense_price(uuid,uuid,uuid,numeric,numeric)','execute') anon_rpc,
      has_function_privilege('authenticated','public.correct_expense_price(uuid,uuid,uuid,numeric,numeric)','execute') member_rpc,
      (select relrowsecurity from pg_class where oid='shopik_private.expense_price_receipts'::regclass) rls`)).rows[0];
    assert.deepEqual(access, { member_read: false, member_write: false, anon_read: false, anon_rpc: false, member_rpc: true, rls: true });
    if (!skip013) {
      const existing = (await db.query("select payload_hash from shopik_private.expense_price_receipts where operation_id='01600000-0000-4000-8000-000000000002'")).rows;
      assert.deepEqual(existing, [{ payload_hash: 'preserve-existing-hash' }]);
      await db.exec("delete from public.workspaces where owner_id='01600000-0000-4000-8000-000000000001'; delete from auth.users where id='01600000-0000-4000-8000-000000000001';");
    }
    for (const file of ['expense_price.sql', 'shopping_workflow.sql']) {
      await db.exec(fs.readFileSync(path.join(root, 'tests', file), 'utf8'));
    }
    console.log(`PASS ${skip013 ? 'missing-013 recovery' : 'existing-013 preservation'}: repeated repair, private receipts, correction/retry and task 019 SQL`);
  } finally { await db.close(); }
}

await checkRecovery(true);
await checkRecovery(false);
