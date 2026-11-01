import assert from 'node:assert/strict';
import crypto from 'node:crypto';

type Connection = {query(sql: string, args?: unknown[]): Promise<{rows: Record<string, string>[]} >};
type Context = {
  admin: Connection; a: Connection; b: Connection; c: Connection;
  wid: string; owner: string; author: string;
  begin(connection: Connection, id: string): Promise<void>;
  asUser(connection: Connection, id: string, sql: string, args?: unknown[]): Promise<{rows: Record<string, string>[]} >;
  waiting(connection: Connection): Promise<void>;
};

// Two independent PostgreSQL sessions must observe one serialized price history.
export async function checkPriceConcurrency({admin,a,b,c,wid,owner,author,begin,asUser,waiting}: Context) {
  const category = (await admin.query('select id from public.categories where workspace_id=$1 limit 1', [wid])).rows[0].id;
  const source = (await asUser(b, author, 'select public.save_product_tags($1,null,$2,$3,10,$4,\'{}\') id', [wid,'Concurrent actual price','',category])).rows[0].id;
  await asUser(b, author, "update public.products set status='completed' where id=$1", [source]);
  const expense = (await admin.query('select id from public.expenses where product_id=$1', [source])).rows[0].id;
  const operation = crypto.randomUUID();
  await begin(b, author);
  await b.query('select public.correct_expense_price($1,$2,$3,20,10)', [wid,expense,operation]);
  const competing = asUser(c, author, 'select public.correct_expense_price($1,$2,$3,30,10)', [wid,expense,crypto.randomUUID()]).then(() => 'accepted', (error: {code: string}) => error.code);
  await waiting(c); await b.query('commit');
  assert.equal(await competing, '40001');
  assert.equal(Number((await admin.query('select amount from public.expenses where id=$1', [expense])).rows[0].amount), 20);
  console.log('PASS independent price connections: stale concurrent correction cannot overwrite');

  // Same-operation retries wait for commit and return the confirmed amount once.
  const retryOperation = crypto.randomUUID();
  await begin(b, author);
  await b.query('select public.correct_expense_price($1,$2,$3,25,20)', [wid,expense,retryOperation]);
  const retry = asUser(c, author, 'select public.correct_expense_price($1,$2,$3,25,20) amount', [wid,expense,retryOperation]);
  await waiting(c); await b.query('commit');
  assert.equal(Number((await retry).rows[0].amount), 25);
  console.log('PASS independent price connections: concurrent retry commits exactly once');

  // Eviction winning the workspace lock must reject a request already waiting.
  const joined = (await admin.query('select created_at::text joined from public.workspace_members where workspace_id=$1 and user_id=$2', [wid,author])).rows[0].joined;
  await begin(a, owner);
  await a.query('select public.remove_workspace_member($1,$2,$3)', [wid,author,joined]);
  const removed = asUser(b, author, 'select public.correct_expense_price($1,$2,$3,99,25)', [wid,expense,crypto.randomUUID()]).then(() => 'accepted', (error: {code: string}) => error.code);
  await waiting(b); await a.query('commit');
  assert.equal(await removed, '42501');
  const retained = (await admin.query('select amount,archived::text archived from public.expenses where id=$1', [expense])).rows[0];
  assert.equal(Number(retained.amount), 25); assert.equal(retained.archived, 'true');
  console.log('PASS independent price connections: eviction blocks waiting correction and preserves archive');
}
