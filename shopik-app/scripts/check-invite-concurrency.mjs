// Real PostgreSQL, independent connections, isolated temporary cluster; never reads hosted DB credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const toolsRoot=process.env.SHOPIK_PG_TOOLS;
if(!toolsRoot)throw Error('Set SHOPIK_PG_TOOLS to isolated tools with pg and @embedded-postgres/windows-x64.');
const requireTools=createRequire(path.join(toolsRoot,'package.json'));
const {Client}=requireTools('pg');
const bin=path.join(toolsRoot,'node_modules/@embedded-postgres/windows-x64/native/bin');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'shopik-invite-pg-'));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const root=path.resolve('..');
const owner='01500000-0000-4000-8000-000000001001';
const users=['01500000-0000-4000-8000-000000001002','01500000-0000-4000-8000-000000001003','01500000-0000-4000-8000-000000001004'];
const clients=[];
let server,admin;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Native processes have no visible windows and bind only to loopback.
async function execute(binary,args){await new Promise((resolve,reject)=>{const child=spawn(path.join(bin,binary+'.exe'),args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('PostgreSQL tool failed: '+text)));});}
async function connect(){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await c.connect();clients.push(c);return c;}
async function begin(c,id){await c.query('begin');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:'authenticated'})]);await c.query('set local role authenticated');}
async function asUser(c,id,sql,args=[]){await begin(c,id);try{const r=await c.query(sql,args);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}}
async function waiting(c){for(let i=0;i<150;i++){const r=await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[c.processID]);if(r.rows[0]?.wait_event_type==='Lock')return;await delay(10);}throw Error('Expected competing PostgreSQL connection to wait for lock');}
try{
 await execute('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C','--locale-provider=builtin','--builtin-locale=C.UTF-8']);
 server=spawn(path.join(bin,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','fsync=off','-c','log_min_error_statement=panic'],{windowsHide:true,stdio:['ignore','ignore','ignore']});
 for(let i=0;i<100;i++){try{admin=await connect();break;}catch{await delay(100);}}
 if(!admin)throw Error('Temporary PostgreSQL did not start');
 await admin.query(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await admin.query(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 for(const file of fs.readdirSync(path.join(root,'supabase/tests')).filter(f=>f.endsWith('.sql')).sort()){await admin.query(fs.readFileSync(path.join(root,'supabase/tests',file),'utf8'));console.log('PASS native PostgreSQL SQL/RLS',file);}
 for(const id of [owner,...users])await admin.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.invalid']);
 const a=await connect(),b=await connect(),c=await connect();
 const wid=(await asUser(a,owner,'select * from public.ensure_personal_workspace()')).rows[0].workspace_id;
 async function invite(){const token=crypto.randomBytes(32).toString('base64url');const r=await asUser(a,owner,'select public.create_workspace_invite($1,$2,$3) value',[wid,crypto.randomUUID(),crypto.createHash('sha256').update(token).digest('hex')]);assert.equal(r.rows[0].value.status,'created');return {token,id:r.rows[0].value.invite.id};}
 const link=await invite();
 const outcomes=await Promise.all([asUser(b,users[0],'select public.accept_workspace_invite($1) value',[link.token]),asUser(c,users[1],'select public.accept_workspace_invite($1) value',[link.token])]);
 assert.deepEqual(outcomes.map(r=>r.rows[0].value.status).sort(),['accepted','used']);
 const winner=outcomes[0].rows[0].value.status==='accepted'?users[0]:users[1];
 const loser=users.find(id=>id!==winner&&id!==users[2]);
 assert.equal((await admin.query('select count(*)::int n from public.workspace_members where workspace_id=$1 and user_id<>$2',[wid,owner])).rows[0].n,1);
 console.log('PASS independent connections: simultaneous accept creates exactly one membership');
 const revoked=await invite();
 await begin(a,owner);await a.query('select public.revoke_workspace_invite($1)',[revoked.id]);
 const competing=asUser(b,loser,'select public.accept_workspace_invite($1) value',[revoked.token]);await waiting(b);await a.query('commit');
 assert.equal((await competing).rows[0].value.status,'revoked');
 console.log('PASS independent connections: revoke-first rejects waiting acceptance');
 const accepted=await invite();
 await begin(b,users[2]);assert.equal((await b.query('select public.accept_workspace_invite($1) value',[accepted.token])).rows[0].value.status,'accepted');
 const revokeLater=asUser(a,owner,'select public.revoke_workspace_invite($1) value',[accepted.id]);await waiting(a);await b.query('commit');
 assert.equal((await revokeLater).rows[0].value.invite.state,'accepted');
 assert.equal((await admin.query('select count(*)::int n from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,users[2]])).rows[0].n,1);
 console.log('PASS independent connections: accept-first preserves membership on later revocation');
 const pending=await invite();
 const joined=(await admin.query('select created_at::text created_at from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,winner])).rows[0].created_at;
 await begin(a,owner);await a.query('select public.remove_workspace_member($1,$2,$3)',[wid,winner,joined]);
 const oldAccept=asUser(b,winner,'select public.accept_workspace_invite($1) value',[pending.token]);await waiting(b);await a.query('commit');
 assert.equal((await oldAccept).rows[0].value.status,'invalid');
 console.log('PASS independent connections: eviction blocks older unclaimed links');
 const fresh=await invite();
 await begin(b,winner);assert.equal((await b.query('select public.accept_workspace_invite($1) value',[fresh.token])).rows[0].value.status,'accepted');
 const staleRemove=asUser(a,owner,'select public.remove_workspace_member($1,$2,$3)',[wid,winner,joined]).then(()=>null,e=>e.code);await waiting(a);await b.query('commit');
 assert.equal(await staleRemove,'22023');
 assert.equal((await admin.query('select count(*)::int n from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,winner])).rows[0].n,1);
 console.log('PASS independent connections: old eviction retry cannot remove a newly accepted membership');
 await admin.query("delete from shopik_private.invite_rate_buckets where user_id=$1 and action='accept'",[loser]);
 const parallel=await Promise.all(Array.from({length:12},()=>connect()));
 const limited=await Promise.all(parallel.map(client=>asUser(client,loser,'select public.accept_workspace_invite($1) value',['Z'.repeat(43)])));
 assert.equal(limited.filter(r=>r.rows[0].value.status==='limited').length,2);
 console.log('PASS independent connections: durable accept budget cannot be raced past its limit');
 // First login can race across tabs after an invitation; only one personal workspace may result.
 const freshUser=crypto.randomUUID();
 await admin.query('insert into auth.users(id,email) values($1,$2)',[freshUser,'parallel-personal@example.invalid']);
 await admin.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'member')",[wid,freshUser]);
 const homes=await Promise.all(parallel.map(client=>asUser(client,freshUser,'select * from public.ensure_personal_workspace()')));
 assert.equal(new Set(homes.map(r=>r.rows[0].workspace_id)).size,1);
 assert.ok(homes.every(r=>r.rows[0].member_role==='owner'&&r.rows[0].workspace_id!==wid));
 assert.equal((await admin.query('select count(*)::int n from public.workspaces where owner_id=$1 and is_personal',[freshUser])).rows[0].n,1);
 assert.equal((await admin.query('select role from public.workspace_members where workspace_id=$1 and user_id=$2',[wid,freshUser])).rows[0].role,'member');
 console.log('PASS independent connections: 12 invited-first personal initializations create exactly one owner workspace');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await Promise.allSettled(clients.map(c=>c.end()));if(server){try{await execute('pg_ctl',['-D',data,'stop','-m','immediate','-w']);}catch{server.kill();}}}
