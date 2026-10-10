import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { remoteExpenseMcp, protectedResource } from '../lib/mcp/remote/server';
import { AuthenticationUnavailable, metadataUrl, tokenVerifier, type Principal } from '../lib/mcp/remote/auth';
import { previewSchema, type RemoteAction } from '../lib/mcp/remote/contracts';
import { manilaToday } from '../lib/finance/core';
import { consentPath, loginReturnPath, oauthCallback } from '../lib/mcp/remote/consent';
import { checkProviderMetadata, probeProvider } from '../lib/mcp/remote/provider';
import { remoteConfig } from '../lib/mcp/remote/config';

const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const account = '20000000-0000-4000-8000-000000000001', foreign = '20000000-0000-4000-8000-000000000002';
const clientId = '30000000-0000-4000-8000-000000000001', client2 = '30000000-0000-4000-8000-000000000002';
const sessionId = '40000000-0000-4000-8000-000000000001', session2 = '40000000-0000-4000-8000-000000000002';
const config = { enabled: true, resource: 'https://tracker.example/api/mcp/expenses', issuer: 'https://project.supabase.co/auth/v1', clientIds: [clientId] };
const principal: Principal = { owner, clientId, sessionId, token: 'synthetic-token' };

test('review deployment cannot be activated by inherited hosting environment settings', t => {
  const overrides = { FINANCE_MCP_REMOTE_ENABLED:'true', FINANCE_MCP_CLIENT_IDS:clientId,
    FINANCE_MCP_RESOURCE:config.resource, NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co' };
  for (const [key,value] of Object.entries(overrides)) {
    const original=process.env[key];
    t.after(()=>{ if(original===undefined) delete process.env[key]; else process.env[key]=original; });
    process.env[key]=value;
  }
  assert.equal(remoteConfig().enabled,false);
  assert.deepEqual(remoteConfig().clientIds,[]);
  assert.equal(protectedResource(remoteConfig()).status,404);
});
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: config.issuer, sub: owner, aud: 'authenticated', role: 'finance_mcp', client_id: clientId, session_id: sessionId,
  exp: Math.floor(Date.now() / 1000) + 1800, iat: Math.floor(Date.now() / 1000), is_anonymous: false,
  finance_mcp_resource: config.resource, finance_mcp_permissions: ['expense:read', 'expense:write'], ...extra,
});
const input = (extra = {}) => ({ request_id: randomUUID(), expense: { account_id: account, amount: '25.10', description: 'Synthetic test purchase' }, duplicate_decision: 'review', ...extra });
type Result = Record<string, unknown> & { retry: Record<string, unknown>; duplicates: unknown[]; accounts: { id: string }[] };
async function fixture(includeIngestion = false) {
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create role authenticated; create role anon; create role service_role; create role authenticator; create role supabase_auth_admin;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
    create table auth.sessions(id uuid primary key,user_id uuid,oauth_client_id uuid,not_after timestamptz);
    create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);
    create table auth.oauth_clients(id uuid primary key,deleted_at timestamptz);`);
  const migrations = ['001_initial_schema','002_add_wallets','003_ledger_integrity','004_financial_operations','005_rebuildable_balances','006_financial_workflows','007_history_only_import','20261007035014_tags_and_planned_items'];
  if (includeIngestion) migrations.push('20261007070000_card_sms_inbox','20261007190256_quick_log','20261010000000_conversational_quick_log');
  for (const name of migrations) await db.exec(await readFile(`supabase/migrations/${name}.sql`, 'utf8'));
  await db.exec(`grant usage on schema public,auth to authenticated,anon; grant all on all tables in schema public to authenticated;
    insert into auth.users values('${owner}','{}'),('${other}','{}');
    insert into public.accounts(id,user_id,name,type,balance) values('${account}','${owner}','Synthetic account','cash',1000),('${foreign}','${other}','Foreign account','bank',1000);
    insert into public.categories(id,user_id,name,type) values('${foreign}','${other}','Foreign category','expense');
    insert into public.tags(id,user_id,name) values('${foreign}','${other}','Foreign tag');
    insert into auth.oauth_clients(id) values('${clientId}'),('${client2}');
    insert into auth.sessions values('${sessionId}','${owner}','${clientId}',null),('${session2}','${owner}','${client2}',null);
    insert into auth.oauth_consents values('${owner}','${clientId}',null),('${owner}','${client2}',null);`);
  await db.exec(await readFile('supabase/proposals/remote_expense_mcp.sql','utf8'));
  await db.query(`insert into finance_private.mcp_integrations(user_id,client_id,resource,issuer,enabled,expires_at)
    values($1,$2,$3,$4,true,now()+interval '1 day'),($1,$5,$3,$4,true,now()+interval '1 day')`, [owner,clientId,config.resource,config.issuer,client2]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims())]);
  await db.exec('set role finance_mcp');
  const invoke = async (action: RemoteAction, args: Record<string, unknown> = {}) =>
    (await db.query<{ r: Result }>('select public.remote_expense($1,$2::jsonb) r',[action,JSON.stringify(args)])).rows[0].r;
  const admin = async (sql: string) => { await db.exec('reset role'); try { return await db.exec(sql); } finally { await db.exec('set role finance_mcp'); } };
  const setClaims = async (extra: Record<string, unknown>) => { await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims(extra))]); };
  return { db, invoke, admin, setClaims };
}

test('remote protocol supports modern/legacy discovery, three tools, strict account and authenticates every request', async () => {
  const { db, invoke } = await fixture();
  let valid = true;
  const endpoint = remoteExpenseMcp({ config, authenticate: async () => { if (!valid) throw Error('revoked'); return principal; }, rpc: () => invoke });
  const connect = async (mode: 'auto' | 'legacy') => {
    const client = new Client({ name: 'synthetic', version: '1' }, { versionNegotiation: { mode } });
    await client.connect(new StreamableHTTPClientTransport(new URL(config.resource), { requestInit: { headers: { Authorization: 'Bearer synthetic-token' } }, fetch: async (url, init) => endpoint(new Request(url, init)) }));
    return client;
  };
  const client = await connect('auto');
  try {
    assert.equal(client.getProtocolEra(), 'modern');
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(t => t.name).sort(), ['expense_commit','expense_context','expense_preview']);
    const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
    const parse = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text) as Result;
    const context = parse(await call('expense_context', {}));
    assert.deepEqual(context.accounts.map(a => a.id), [account]);
    assert.ok(!JSON.stringify(context).includes('balance'));
    const missing = { ...input(), expense: { amount: '25', description: 'Synthetic' } };
    assert.equal((await call('expense_preview', missing)).isError, true);
    assert.equal((await call('expense_context', { owner: other })).isError, true);
    const p = parse(await call('expense_preview', input()));
    const saved = parse(await call('expense_commit', p.retry));
    assert.equal(saved.persisted, true); assert.ok(saved.transaction_id);
    assert.deepEqual(parse(await call('expense_commit', p.retry)), saved);
    const legacy = await connect('legacy'); assert.equal(legacy.getProtocolEra(), 'legacy'); assert.equal((await legacy.listTools()).tools.length, 3); await legacy.close();
    valid = false; await assert.rejects(() => client.listTools());
  } finally { await client.close(); await db.close(); }
});

test('database enforces explicit ownership, exact PHP, dates, persistent receipts, duplicate review and rollback', async () => {
  const { db, invoke, admin } = await fixture();
  try {
    assert.equal((await invoke('preview', { ...input(), expense: { amount: '2', description: 'Synthetic' } })).error, 'account_required');
    for (const expense of [
      { account_id: foreign, amount: '25', description: 'Synthetic' },
      { account_id: account, amount: '1.001', description: 'Synthetic' },
      { account_id: account, amount: 25.10, description: 'Synthetic' },
      { account_id: account, amount: '25', description: 'Synthetic', date: '2026-02-30' },
      { account_id: account, amount: '25', description: 'Synthetic', date: '2099-01-01' },
      { account_id: account, amount: '25', description: 'Synthetic', category_id: foreign },
      { account_id: account, amount: '25', description: 'Synthetic', tag_ids: [foreign] },
      { account_id: account, amount: '25', description: 'Synthetic', type: 'income' },
    ]) assert.ok((await invoke('preview', { ...input(), expense })).error);
    const p = await invoke('preview', input());
    assert.equal((p.retry.expense as { date: string }).date, manilaToday());
    assert.equal((await invoke('commit', { ...p.retry, digest: '0'.repeat(64) })).error, 'preview_required_or_stale');
    const saved = await invoke('commit', p.retry); assert.equal(saved.persisted, true); assert.ok(saved.transaction_id);
    // A second caller/instance and multiple simultaneous retries read one durable receipt.
    assert.deepEqual(await Promise.all([invoke('commit',p.retry),invoke('commit',p.retry)]), [saved,saved]);
    assert.equal((await invoke('commit', { ...p.retry, intent: 'example' })).error, 'idempotency_conflict');
    const p2 = await invoke('preview', input()); assert.equal(p2.duplicates.length, 1);
    const held = await invoke('commit', p2.retry); assert.equal(held.status,'needs_review');assert.equal(held.persisted,false);
    assert.deepEqual(await invoke('commit',p2.retry),held);
    const p3 = await invoke('preview',input({duplicate_decision:'confirmed_separate'}));
    assert.equal((await invoke('commit',p3.retry)).status,'recorded');
    const stale = await invoke('preview', input());
    const distinct = await invoke('preview',input({duplicate_decision:'confirmed_separate'}));await invoke('commit',distinct.retry);
    assert.equal((await invoke('commit',stale.retry)).error,'preview_required_or_stale');
    await admin(`update accounts set is_archived=true where id='${account}'`);
    assert.deepEqual(await invoke('commit',p.retry),saved); // original receipt, even after account changes
    await admin(`update accounts set is_archived=false where id='${account}';
      create function public.synthetic_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;
      create trigger zzz_failure after insert on transactions for each row execute function public.synthetic_failure();`);
    const fail = await invoke('preview', { ...input(), expense: { account_id: account, amount: '99.99', description: 'Synthetic rollback' } });
    await assert.rejects(() => invoke('commit', fail.retry), /synthetic failure/);
    await admin('drop trigger zzz_failure on transactions');
    assert.equal((await invoke('commit',fail.retry)).status,'recorded');
    await db.exec('reset role');
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from transactions')).rows[0].n,4);
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from financial_audit')).rows[0].n,4);
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from finance_private.mcp_requests')).rows[0].n,5);
  } finally { await db.close(); }
});

test('OAuth tokens cannot reuse broad owner tables/RPCs, bypass revocation, cross owners or integrations', async () => {
  const { db, invoke, admin, setClaims } = await fixture(true);
  try {
    for (const table of ['accounts','transactions','financial_audit','quick_log_credentials','finance_private.mcp_integrations','finance_private.mcp_requests'])
      await assert.rejects(() => db.exec(`select * from ${table}`), /permission denied/);
    await assert.rejects(() => db.query('select public.commit_financial_operation($1,$2::jsonb)',[randomUUID(),'{}']),/permission denied/);
    // Simulate an old or incorrectly issued OAuth authenticated-role token.
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from accounts')).rows.length,0);
    assert.equal((await db.query('select * from ledger_account_balances')).rows.length,0);
    for (const sql of [
      `select public.commit_financial_operation('${randomUUID()}','{}')`,
      `select public.manage_quick_log_credential('list','{}')`,
      `select public.manage_card_sms_credential('list','{}')`,
    ]) await assert.rejects(()=>db.exec(sql),/OAuth client cannot use owner RPC/);
    await db.exec('set role finance_mcp');
    const p = await invoke('preview',input()), saved = await invoke('commit',p.retry);
    await setClaims({sub:other}); assert.equal((await invoke('commit',p.retry)).error,'unauthorized');
    await setClaims({client_id:client2,session_id:session2}); assert.equal((await invoke('commit',p.retry)).error,'preview_required_or_stale');
    const p2 = await invoke('preview', { ...input(),request_id:p.retry.request_id,expense:{account_id:account,amount:'30.00',description:'Synthetic other integration'} });
    assert.equal((await invoke('commit',p2.retry)).persisted,true);
    await setClaims({}); assert.deepEqual(await invoke('commit',p.retry),saved);
    for (const extra of [{finance_mcp_resource:'https://evil.example'},{role:'authenticated'},{exp:1},{finance_mcp_permissions:['expense:read']}]) {
      await setClaims(extra);assert.equal((await invoke('authorize')).error,'unauthorized');
    }
    await setClaims({});
    await admin(`update auth.oauth_consents set revoked_at=now() where client_id='${clientId}'`);
    assert.equal((await invoke('commit',p.retry)).error,'unauthorized');
    await admin(`update auth.oauth_consents set revoked_at=null; delete from auth.sessions where id='${sessionId}'`);
    assert.equal((await invoke('authorize')).error,'unauthorized');
    await admin(`insert into auth.sessions values('${sessionId}','${owner}','${clientId}',null);update finance_private.mcp_integrations set enabled=false`);
    assert.equal((await invoke('authorize')).error,'unauthorized');
    // Ordinary app sessions retain their existing owner policies and RPC access.
    await setClaims({client_id:null,role:'authenticated'});await db.exec('set role authenticated');
    assert.equal((await db.query('select * from accounts')).rows.length,1);
    assert.ok((await db.query("select manage_quick_log_credential('list','{}')")).rows);
  } finally { await db.close(); }
});

test('hook pins resource/role from approved integration, rejects unknown clients and preserves regular sessions',async()=>{
  const {db}=await fixture();try{
    await db.exec('reset role');
    const hook=async(event:unknown)=>(await db.query<{r:{claims:Record<string,unknown>}}>('select finance_private.mcp_access_token_hook($1::jsonb) r',[JSON.stringify(event)])).rows[0].r;
    const ordinary={sub:owner,role:'authenticated',iss:config.issuer};
    assert.deepEqual((await hook({claims:ordinary,authentication_method:'password'})).claims,ordinary);
    const issued=(await hook({claims:ordinary,client_id:clientId})).claims;
    assert.equal(issued.role,'finance_mcp');assert.equal(issued.finance_mcp_resource,config.resource);
    await assert.rejects(()=>hook({claims:ordinary,client_id:randomUUID()}),/not authorized/);
    await assert.rejects(()=>hook({claims:ordinary,authentication_method:'oauth_provider\/authorization_code'}),/Missing OAuth/);
    await db.exec('set role authenticated');await assert.rejects(()=>hook({claims:ordinary,client_id:clientId}),/permission denied/);
  }finally{await db.close();}
});

test('cryptographic verification rejects wrong issuer, resource, role, client, expiry, scope and signatures', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const verify = tokenVerifier(config,createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'ES256'}]}));
  const sign = (extra = {}) => new SignJWT(claims(extra)).setProtectedHeader({alg:'ES256',kid:'test'}).sign(privateKey);
  assert.equal((await verify(await sign())).owner,owner);
  await assert.rejects(()=>sign().then(tokenVerifier({...config,clientIds:[]},createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'ES256'}]}))));
  for (const extra of [{iss:'https://evil.example'},{aud:'elsewhere'},{finance_mcp_resource:'https://elsewhere.example'},{client_id:client2},{exp:1},{nbf:9999999999},{role:'authenticated'},{finance_mcp_permissions:['expense:read']},{sub:other,session_id:null},{is_anonymous:true}])
    await assert.rejects(()=>sign(extra).then(verify));
  const otherKey = await generateKeyPair('ES256');
  await assert.rejects(()=>new SignJWT(claims()).setProtectedHeader({alg:'ES256',kid:'test'}).sign(otherKey.privateKey).then(verify));
});

test('auth discovery and boundary fail closed; malformed saved receipt never confirms a write', async () => {
  assert.equal(protectedResource({...config,enabled:false}).status,404);
  assert.equal(protectedResource({...config,resource:'http://tracker.example/api/mcp/expenses'}).status,503);
  const metadata=await protectedResource(config).json();assert.equal(metadata.resource,config.resource);assert.deepEqual(metadata.scopes_supported,['openid']);
  let calls=0;
  const endpoint=remoteExpenseMcp({config,authenticate:async()=>principal,rpc:()=>async action=>{calls++;return action==='authorize'?{authorized:true}:{status:'recorded',persisted:true};}});
  const req=(headers:Record<string,string>={},url=config.resource)=>new Request(url,{headers});
  const disabled=remoteExpenseMcp({config:{...config,enabled:false},authenticate:async()=>{throw Error('must not authenticate');},rpc:()=>{throw Error('must not call');}});
  assert.equal((await disabled(req())).status,404);
  const missing=await endpoint(req());assert.equal(missing.status,401);assert.ok(missing.headers.get('WWW-Authenticate')?.includes(metadataUrl(config)));
  assert.equal((await endpoint(req({cookie:'browser-session'}))).status,401);
  assert.equal((await endpoint(req({origin:'https://evil.example',authorization:'Bearer token'}))).status,403);
  assert.equal((await endpoint(req({authorization:'Bearer token'},`${config.resource}?access_token=token`))).status,403);
  assert.equal(calls,0);
  const unavailable=remoteExpenseMcp({config,authenticate:async()=>{throw new AuthenticationUnavailable();},rpc:()=>async()=>{throw Error('must not call');}});
  assert.equal((await unavailable(req({authorization:'Bearer token'}))).status,503);
  const misconfigured=remoteExpenseMcp({config,authenticate:async()=>principal,rpc:()=>{throw Error('unconfigured');}});
  assert.equal((await misconfigured(req({authorization:'Bearer token'}))).status,503);
  const client=new Client({name:'synthetic',version:'1'});
  const protocolRequest=(body:string)=>new Request(config.resource,{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json',accept:'application/json, text/event-stream'},body});
  assert.equal((await endpoint(protocolRequest('{'))).status,400);
  assert.equal((await endpoint(protocolRequest(' '.repeat(16001)))).status,413);
  assert.equal((await endpoint(new Request(config.resource,{method:'PUT'}))).status,405);
  await client.connect(new StreamableHTTPClientTransport(new URL(config.resource),{requestInit:{headers:{Authorization:'Bearer token'}},fetch:async(url,init)=>endpoint(new Request(url,init))}));
  try {
    const result=await client.callTool({name:'expense_commit',arguments:{...input(),expense:{...input().expense,date:manilaToday()},digest:'0'.repeat(64),intent:'log_expense'}});
    assert.equal(result.isError,true);assert.match((result.content as {text:string}[])[0].text,/unconfirmed/);
  }finally{await client.close();}
  assert.equal(previewSchema.safeParse({ ...input(), expense:{amount:'1.00',description:'Example'} }).success,false);
  assert.equal(manilaToday(new Date('2026-10-09T16:00:00Z')),'2026-10-10');
});

test('consent login return and provider callback never accept arbitrary redirect destinations',()=>{
  const path=consentPath(sessionId);assert.equal(loginReturnPath(path),path);
  for(const value of ['//evil.example','https://evil.example/oauth/consent','/oauth/consent?authorization_id=invalid',`${path}&next=https://evil.example`,'/dashboard'])assert.equal(loginReturnPath(value),'/');
  const callback='https://chatgpt.com/connector/oauth/synthetic-callback';
  assert.equal(oauthCallback(`${callback}?code=synthetic&state=test`,callback),`${callback}?code=synthetic&state=test`);
  for(const value of ['https://evil.example','https://chatgpt.com/other',`${callback}#token=secret`,'https://user@chatgpt.com/connector/oauth/synthetic-callback'])assert.throws(()=>oauthCallback(value,callback));
});

test('persistent quotas, tenant-scoped IDs, example intent and archived accounts fail safely',async()=>{
  const {db,invoke,admin,setClaims}=await fixture();try{
    const p=await invoke('preview',input());
    assert.equal((await invoke('commit',{...p.retry,intent:'example'})).error,'invalid_request');
    const first=await invoke('commit',p.retry);
    await admin(`update finance_private.mcp_integrations set minute_count=60,minute_start=now() where client_id='${clientId}'`);
    assert.equal((await invoke('preview',input())).error,'rate_limited');assert.deepEqual(await invoke('commit',p.retry),first);
    await admin(`update finance_private.mcp_integrations set minute_count=0,day_count=500 where client_id='${clientId}'`);
    assert.equal((await invoke('context')).error,'rate_limited');
    await admin(`update finance_private.mcp_integrations set day_count=0;update accounts set is_archived=true where id='${account}'`);
    assert.equal((await invoke('preview',input())).error,'account_unavailable');
    await admin(`insert into finance_private.mcp_integrations(user_id,client_id,resource,issuer,enabled,expires_at)
      values('${other}','${clientId}','${config.resource}','${config.issuer}',true,now()+interval '1 day');
      insert into auth.sessions values('${foreign}','${other}','${clientId}',null);
      insert into auth.oauth_consents values('${other}','${clientId}',null);`);
    await setClaims({sub:other,session_id:foreign});
    const second=await invoke('preview',{...input(),request_id:p.retry.request_id,expense:{account_id:foreign,amount:'25.10',description:'Synthetic other owner'}});
    const saved=await invoke('commit',second.retry);assert.equal(saved.persisted,true);assert.notEqual(saved.transaction_id,first.transaction_id);
    assert.deepEqual((await invoke('context')).accounts.map(a=>a.id),[foreign]);
  }finally{await db.close();}
});

test('provider probe requires published PKCE, exact issuer, asymmetric JWKS and never mints credentials',async()=>{
  const raw={issuer:config.issuer,authorization_endpoint:`${config.issuer}/oauth/authorize`,token_endpoint:`${config.issuer}/oauth/token`,
    response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],
    token_endpoint_auth_methods_supported:['none'],scopes_supported:['openid','email','profile']};
  assert.equal(checkProviderMetadata(raw,config.issuer).issuer,config.issuer);
  for(const change of [{issuer:'https://evil.example'},{code_challenge_methods_supported:[]},{token_endpoint:'https://evil.example/token'},{grant_types_supported:['client_credentials']},{scopes_supported:[]}])
    assert.throws(()=>checkProviderMetadata({...raw,...change},config.issuer));
  const calls:string[]=[];
  const fake:typeof fetch=async(url,init)=>{
    calls.push(String(url));assert.equal(init?.redirect,'error');assert.ok(!init?.headers);assert.ok(!init?.body);
    return Response.json(String(url).endsWith('jwks.json')?{keys:[{kty:'EC',alg:'ES256',use:'sig'}]}:raw);
  };
  const proof=await probeProvider('https://project.supabase.co',fake);assert.equal(calls.length,2);assert.equal(proof.pkce,'S256');assert.equal(proof.staging_proof_required.length,4);
  await assert.rejects(()=>probeProvider('https://project.supabase.co',async()=>Response.json({error:'disabled'},{status:404})));
});
