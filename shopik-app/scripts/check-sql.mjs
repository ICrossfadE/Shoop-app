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
      await db.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
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
