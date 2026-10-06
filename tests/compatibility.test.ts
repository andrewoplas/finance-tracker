import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {financeSchemaSQL} from '../scripts/build-finance-schema';
test('isolated schema preserves legacy public data/auth trigger and opens only reviewed owner access',async()=>{
 const db=new PGlite();
 try{
 await db.exec(await readFile('tests/fixtures/legacy-supabase.sql','utf8'));
 const snapshot=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(w order by id) from public.wallets w) wallets,(select jsonb_agg(c order by id) from public.categories c) categories,(select jsonb_agg(t order by id) from public.transactions t) transactions,(select pg_get_functiondef('public.create_user_wallets()'::regprocedure)) function,(select pg_get_triggerdef(oid) from pg_trigger where tgname='create_wallets_on_signup') trigger`)).rows);
 const before=await snapshot();
 const securitySnapshot=async()=>JSON.stringify((await db.query(`select n.nspname,c.relname,c.relacl,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname`)).rows);
 const definitionsSnapshot=async()=>JSON.stringify((await db.query(`select
 (select jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') functions,
 (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and not t.tgisinternal) triggers,
 (select jsonb_agg(p order by p.tablename,p.policyname) from pg_policies p where schemaname='public') policies,
 (select jsonb_agg(d order by d.oid) from pg_default_acl d) defaults`)).rows);
 const beforeDefinitions=await definitionsSnapshot();
 const beforeSecurity=await securitySnapshot();
 assert.deepEqual((await db.query('select (select count(*)::int from public.wallets) wallets,(select count(*)::int from public.categories) categories,(select count(*)::int from public.transactions) transactions')).rows[0],{wallets:9,categories:14,transactions:6});const sql=await financeSchemaSQL();assert.equal(sql,await readFile('supabase/compatibility/finance-isolated.sql','utf8'));await db.exec(sql);assert.equal(await snapshot(),before);assert.equal(await securitySnapshot(),beforeSecurity);assert.equal(await definitionsSnapshot(),beforeDefinitions);
 assert.equal((await db.query<{allowed:boolean}>(`select has_schema_privilege('authenticated','finance','usage') allowed`)).rows[0].allowed,false);
 await assert.rejects(()=>db.exec(sql));await db.exec('rollback');assert.equal(await snapshot(),before);
 await db.exec(await readFile('supabase/compatibility/finance-api-access.sql','utf8'));
 const actor='10000000-0000-4000-8000-000000000005';await db.exec(`insert into auth.users values('${actor}','{}');`);
 assert.equal((await db.query<{n:number}>(`select count(*)::int n from public.wallets where user_id='${actor}'`)).rows[0].n,3);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from finance.profiles')).rows[0].n,0);
 await db.exec(`set role authenticated;select set_config('test.uid','${actor}',false);insert into finance.profiles(id) values('${actor}');`);
 await assert.rejects(()=>db.exec(`insert into finance.profiles(id) values('10000000-0000-4000-8000-000000000001')`));
 await assert.rejects(()=>db.exec(`select finance.commit_financial_operation_base(gen_random_uuid(),'{}')`));
 await db.exec(`insert into finance.accounts(user_id,name,type,balance) values('${actor}','Synthetic account','bank',0);`);
 const account=(await db.query<{id:string}>('select id from finance.accounts')).rows[0].id;
 await db.query('select finance.commit_financial_operation(gen_random_uuid(),$1::jsonb)',[JSON.stringify({action:'create',entries:[{account_id:account,type:'expense',amount:'1.25',description:'Synthetic',date:'2026-01-01',report_month:'2026-01',personal_amount:'1.25'}]})]);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from finance.transactions')).rows[0].n,1);
 await assert.rejects(()=>db.exec('delete from finance.transactions'));
 await db.exec(`select set_config('test.uid','10000000-0000-4000-8000-000000000001',false);`);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from finance.finance_report_rows')).rows[0].n,0);
 }finally{await db.close();}
});
