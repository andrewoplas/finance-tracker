import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {publicResetSQL} from '../scripts/build-public-reset';
const fixture=()=>readFile('tests/fixtures/legacy-supabase.sql','utf8');
test('fresh reset preserves auth and unrelated objects, replaces signup and closes default ACLs',async()=>{
 const db=new PGlite();try{
 await db.exec(await fixture());
 await db.exec(`create table public.unrelated(id int); insert into public.unrelated values(42); create function public.unrelated_fn() returns int language sql as $$select 42$$;`);
 const snapshot=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(u order by id) from auth.users u) users,(select jsonb_agg(t) from public.unrelated t) unrelated,(select relacl from pg_class where oid='public.unrelated'::regclass) acl,(select proacl from pg_proc where oid='public.unrelated_fn()'::regprocedure) fnacl,(select jsonb_agg(d order by oid) from pg_default_acl d) defaults`)).rows);
 const before=await snapshot(); const sql=await publicResetSQL();assert.equal(sql,await readFile('supabase/compatibility/public-fresh-start.sql','utf8'));await db.exec(sql);assert.equal(await snapshot(),before);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from public.transactions')).rows[0].n,0);
 assert.equal((await db.query<{n:number}>(`select count(*)::int n from pg_trigger where tgname='create_wallets_on_signup'`)).rows[0].n,0);
 // Check every application function: only the validated wrapper may execute as authenticated.
 const functions=(await db.query<{proname:string;anon:boolean;member:boolean;service:boolean}>(`select proname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') member,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname not in ('unrelated_fn','update_updated_at_column')`)).rows;
 for(const f of functions){assert.equal(f.anon,false,f.proname);assert.equal(f.service,false,f.proname);assert.equal(f.member,f.proname==='commit_financial_operation',f.proname);}
 const rows=(await db.query<{relname:string;anon:boolean;service:boolean;rls:boolean}>(`select relname,has_table_privilege('anon',c.oid,'select,insert,update,delete') anon,has_table_privilege('service_role',c.oid,'select,insert,update,delete') service,relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relname<>'unrelated'`)).rows;
 for(const r of rows){assert.equal(r.anon,false,r.relname);assert.equal(r.service,false,r.relname);assert.equal(r.rls,true,r.relname);}
 const actor='10000000-0000-4000-8000-000000000005';await db.exec(`insert into auth.users values('${actor}','{}');`);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from public.profiles')).rows[0].n,1);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from public.wallets')).rows[0].n,0);
 await db.exec(`set role authenticated;select set_config('test.uid','${actor}',false);insert into public.accounts(user_id,name,type,balance) values('${actor}','Synthetic','bank',0)`);
 const account=(await db.query<{id:string}>('select id from public.accounts')).rows[0].id;
 await assert.rejects(()=>db.exec(`insert into public.profiles(id) values('10000000-0000-4000-8000-000000000001')`));
 await db.query('select public.commit_financial_operation(gen_random_uuid(),$1::jsonb)',[JSON.stringify({action:'create',entries:[{account_id:account,type:'expense',amount:'1.25',description:'Synthetic',date:'2026-01-01',report_month:'2026-01',personal_amount:'1.25'}]})]);
 await assert.rejects(()=>db.exec('delete from public.transactions'));
 await assert.rejects(()=>db.exec(`select public.commit_financial_operation_base(gen_random_uuid(),'{}')`));
 await db.exec(`select set_config('test.uid','10000000-0000-4000-8000-000000000001',false)`);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from public.finance_report_rows')).rows[0].n,0);
 await db.exec('reset role');await assert.rejects(()=>db.exec(sql));await db.exec('rollback');assert.equal((await db.query<{n:number}>('select count(*)::int n from public.transactions')).rows[0].n,1);
 }finally{await db.close();}
});
for(const dependency of ['view','foreign key'])test(`reset rolls back fully on unknown ${dependency} dependency`,async()=>{
 const db=new PGlite();try{await db.exec(await fixture());
 await db.exec(dependency==='view'?'create view public.legacy_report as select * from public.transactions':'create table public.external_reference(id uuid references public.wallets(id))');
 const snapshot=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(t order by id) from public.transactions t) transactions,(select jsonb_agg(u order by id) from auth.users u) users,(select pg_get_triggerdef(oid) from pg_trigger where tgname='create_wallets_on_signup') trigger`)).rows);
 const before=await snapshot();const sql=await publicResetSQL();await assert.rejects(()=>db.exec(sql));await db.exec('rollback');assert.equal(await snapshot(),before);
 }finally{await db.close();}
});

