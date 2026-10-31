// Local PostgreSQL compatibility checks; never connects to the hosted database.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireRuntime = createRequire(import.meta.url);
if (!process.env.SHOPIK_SQL_MODULES) throw new Error('Set SHOPIK_SQL_MODULES to an isolated node_modules directory.');
const { PGlite } = requireRuntime(path.join(process.env.SHOPIK_SQL_MODULES, '@electric-sql/pglite'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
    for (const file of fs.readdirSync(path.join(root, 'migrations')).filter((file) => file.endsWith('.sql')).sort()) {
      let beforeUpgrade;
      if (file.includes('shared_permissions')) {
        // Exercise the data migration on real pre-011 rows, not only empty tables.
        await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('01100000-0000-4000-8000-000000009999','upgrade@example.invalid','{"full_name":"Upgrade author"}');
          select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000009999","role":"authenticated"}',false);
          set role authenticated; select * from public.ensure_personal_workspace();
          insert into public.tags(workspace_id,name,color) select workspace_id,'Upgrade tag','#123456' from public.workspace_members;
          select public.save_product_tags(workspace_id,null,'Upgrade expense','',12.34,(select id from public.categories limit 1),array[(select id from public.tags limit 1)]) from public.workspace_members;
          update public.products set status='completed'; reset role;
          update public.expenses set occurred_at='2026-03-31T21:30:00Z'  ;`);
        beforeUpgrade=(await db.query("select amount::text,occurred_at::text,category_id::text,category_name,public.product_tag_list(workspace_id,product_id) tags from public.expenses")).rows[0];
      }
      await db.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
      if (beforeUpgrade) {
        const after=(await db.query('select amount::text,occurred_at::text,category_id::text,category_name,tags,author from public.expenses')).rows[0];
        const {author,...values}=after;
        if (JSON.stringify(beforeUpgrade)!==JSON.stringify(values)||author.display_name!=='Upgrade author') throw new Error('Historical migration changed expense data');
        await db.exec("delete from public.workspaces where owner_id='01100000-0000-4000-8000-000000009999'; delete from auth.users where id='01100000-0000-4000-8000-000000009999';");
        console.log('PASS pre-existing expense upgrade: amount, Kyiv boundary timestamp, category, tags and author');
      }
      console.log('PASS migration', file);
    }
    for (const file of fs.readdirSync(path.join(root, 'tests')).filter((file) => file.endsWith('.sql')).sort()) {
      try {
        await db.exec(fs.readFileSync(path.join(root, 'tests', file), 'utf8'));
        console.log('PASS SQL', file);
      } catch (error) {
        console.error(file, error.message, error.where);
        process.exitCode = 1;
        await db.exec('ROLLBACK');
      }
    }
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message, error.where); process.exitCode = 1; });
