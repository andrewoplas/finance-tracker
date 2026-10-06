import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { financeMcp } from '../lib/mcp/finance-server';
import { financialOperation } from '../lib/finance/operation-service';
const origin = 'http://127.0.0.1:4317';
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const bank = '20000000-0000-4000-8000-000000000001';
const foreign = '20000000-0000-4000-8000-000000000002';
test('MCP modern discovery and legacy initialization use validated operations with owner, retry and undo guarantees', async () => {
  const db = new PGlite();
  await db.exec(`create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`);
  for (const name of ['001_initial_schema','002_add_wallets','003_ledger_integrity','004_financial_operations','005_rebuildable_balances','006_financial_workflows']) await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
  await db.exec(`insert into auth.users values('${owner}','{}'),('${other}','{}'); select set_config('test.uid','${owner}',false); insert into accounts(id,user_id,name,type,balance) values('${bank}','${owner}','Synthetic bank','bank',1000),('${foreign}','${other}','Other','bank',1000);`);
  let valid = true;
  const endpoint = financeMcp({enabled:true,origin,authenticate: async()=>valid,dispatch:async(request,action)=>{
    if(action==='context')return Response.json({currency:'PHP',owner});
    if(action!=='commit'&&action!=='preview')return Response.json({error:'unavailable'},{status:503});
    return financialOperation(action,await request.json(),request.headers.get('x-finance-preview'),async args=>{
      try { const r = await db.query<{result:unknown}>('select commit_financial_operation($1,$2::jsonb) result',[args.request_id,JSON.stringify(args.operation)]);return {data:r.rows[0].result,error:null}; }
      catch(e){return {data:null,error:{code:'P0001',message:e instanceof Error?e.message:'Rejected'}};}
    });
  }});
  const connect = async(mode:'auto'|'legacy')=>{
    const client = new Client({name:'synthetic-test',version:'1'},{versionNegotiation:{mode}});
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`),{requestInit:{headers:{origin}},fetch:async(input,init)=>endpoint.fetch(new Request(input,init))}));return client;
  };
  const client=await connect('auto');
  try {
    assert.equal(client.getProtocolEra(),'modern');
    const tools=await client.listTools();assert.equal(tools.tools.length,6);
    assert.ok(tools.tools.find(t=>t.name==='finance_commit')?.inputSchema);
    const call=async(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args});
    const parse=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse((r.content as {text:string}[])[0].text);
    const payload={request_id:randomUUID(),operation:{action:'create',entries:[{account_id:bank,type:'expense',amount:'25.10',description:'Synthetic meal',date:'2026-10-06',report_month:'2026-10',attribution:'personal',personal_amount:'25.10',review_status:'pending'}]}};
    const preview=parse(await call('finance_preview',payload));assert.equal(preview.persisted,false);
    const args={...payload,digest:preview.digest};
    assert.equal((await call('finance_commit',{...args,digest:'0'.repeat(64)})).isError,true);
    const first=parse(await call('finance_commit',args));assert.equal(first.persisted,true);
    assert.equal(Number((await db.query<{balance:string}>(`select balance from accounts where id='${bank}'`)).rows[0].balance),974.9);
    assert.deepEqual(parse(await call('finance_commit',args)),first);
    assert.equal((await db.query<{n:number}>('select count(*)::int n from transactions')).rows[0].n,1);
    const wrong={...payload,request_id:randomUUID(),operation:{...payload.operation,entries:[{...payload.operation.entries[0],account_id:foreign}]}};
    const wrongPreview=parse(await call('finance_preview',wrong));assert.equal((await call('finance_commit',{...wrong,digest:wrongPreview.digest})).isError,true);
    const row=(await db.query<{id:string;audit:string}>('select t.id,a.id::text audit from transactions t join financial_audit a on a.transaction_id=t.id order by a.id desc limit 1')).rows[0];
    const undo={request_id:randomUUID(),operation:{action:'undo',id:row.id,expected_audit_id:row.audit}};
    const up=parse(await call('finance_preview',undo));assert.equal(parse(await call('finance_commit',{...undo,digest:up.digest})).persisted,true);
    assert.equal(Number((await db.query<{balance:string}>(`select balance from accounts where id='${bank}'`)).rows[0].balance),1000);
    assert.equal((await call('finance_context',{user_id:other})).isError,true);
    assert.equal((await call('finance_search',{month:'2026-99'})).isError,true);
    assert.equal((await call('finance_report',{month:'2026-10'})).isError,true);
    await assert.rejects(()=>call('not_a_tool',{}));
    const badJson = await endpoint.fetch(new Request(`${origin}/api/mcp`,{method:'POST',headers:{origin,'content-type':'application/json',accept:'application/json, text/event-stream'},body:'{'}));
    assert.equal(badJson.status,400);
    assert.equal((await endpoint.fetch(new Request(`${origin}/api/mcp`,{method:'DELETE',headers:{origin}}))).status,405);
    const legacy=await connect('legacy');assert.equal(legacy.getProtocolEra(),'legacy');assert.equal((await legacy.listTools()).tools.length,6);await legacy.close();
    valid=false;await assert.rejects(()=>client.listTools());
  } finally {await client.close();await endpoint.close();await db.close();}
});
test('MCP fails closed for disabled, missing/revoked/unavailable auth and hostile origins',async()=>{
 const req=(headers:Record<string,string>={origin})=>new Request(`${origin}/api/mcp`,{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'});
 for(const [enabled,authenticate,headers,status] of [
  [false,async()=>true,{origin},404],
  [true,async()=>false,{origin},401],
  [true,async()=>{throw Error('auth offline')},{origin},503],
  [true,async()=>true,{origin:'https://evil.example'},403],
  [true,async()=>true,{},403],
  [true,async()=>true,{origin,authorization:'Bearer not-accepted'},401],
 ] as const){let called=false;const server=financeMcp({enabled,origin,authenticate,dispatch:async()=>{called=true;return Response.json({});}});assert.equal((await server.fetch(req(headers))).status,status);assert.equal(called,false);await server.close();}
});
