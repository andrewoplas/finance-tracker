import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeSmsHandler, State, Parser } from '../lib/finance/ai-sms/http';
import { InputError } from '../lib/finance/sms/http';
import OpenAI from 'openai';
import { Purchase, validPurchase, parseWithOpenAI } from '../lib/finance/ai-sms/parser';

const purchase: Purchase = { kind: 'purchase', merchant: 'Synthetic Shop', amount: '12.30', currency: 'PHP', last4: '9999', date: '2026-10-10', time: '13:00' };
const input = { sms: 'Approved PHP12.30 at Synthetic Shop on 10/10 1:00PM using card xxxx9999.', received_at: '2026-10-10T13:01:00+08:00' };
const token = 'synthetic-test-worker-token-32-characters';
function request(id: string, body = input, authorization = `Bearer ${token}`) {
  return new Request('http://localhost/api/v1/card-notifications', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json', 'Idempotency-Key': id }, body: JSON.stringify(body) });
}
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'sms-worker-test-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const config = (dir: string) => ({ token, stateDir: dir, cards: { '9999': { account: 'Test Card', category: 'Spending' } }, financeOrigin: 'https://example.invalid', financeToken: 'ft_quick_' + 'a'.repeat(64) });

// Shared mock store survives new handler instances, like the database store.
const stores = new Map<string, Map<string, { hash: string; lease: string | null; state: State }>>();
function makeSmsWorker(settings: ReturnType<typeof config>, parse: Parser, fetcher: typeof fetch = fetch) {
  const records = stores.get(settings.stateDir) || new Map();
  stores.set(settings.stateDir, records);
  return makeSmsHandler(settings, parse, async (action, id, hash, lease, state = {}) => {
    let record = records.get(id);
    if (record && record.hash !== hash) throw new InputError(409, 'idempotency_conflict');
    if (action === 'claim') {
      if (record?.state.response) return structuredClone(record.state);
      if (record?.lease) throw new InputError(429, 'busy');
      record ||= { hash, lease: null, state: {} };
      record.lease = lease; records.set(id, record);
      return structuredClone(record.state);
    }
    if (record?.lease !== lease) throw new InputError(409, 'lease_lost');
    if (action === 'release') record.lease = null;
    else record.state = structuredClone(state);
    return structuredClone(record.state);
  }, async request => fetcher(request.url, { method: request.method, headers: request.headers, body: await request.text() }));
}

test('auth and malformed input never invoke AI or Finance', async () => fixture(async dir => {
  let calls = 0;
  const handler = makeSmsWorker(config(dir), async () => { calls++; return purchase; });
  assert.equal((await handler(request(randomUUID(), input, 'Bearer wrong'))).status, 401);
  assert.equal((await handler(request(randomUUID(), { sms: '', received_at: 'bad' }))).status, 400);
  assert.equal(calls, 0);
}));

test('unsupported, ambiguous and unmapped purchases never save', async () => fixture(async dir => {
  let calls = 0;
  for (const p of [{ ...purchase, kind: 'unsupported' as const }, { ...purchase, date: null }, { ...purchase, last4: '1234' }]) {
    const handler = makeSmsWorker(config(dir), async () => p, async () => { calls++; throw new Error('unexpected'); });
    const response = await handler(request(randomUUID()));
    assert.ok([200, 422].includes(response.status));
    assert.equal((await response.json()).persisted, false);
  }
  assert.equal(calls, 0);
}));

test('confirmed save replays from stored receipt; altered request conflicts', async () => fixture(async dir => {
  let parsed = 0, committed = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === 'preview') return Response.json({ request_id: id, persisted: false, date: purchase.date, digest: 'b'.repeat(64), entry: { amount: '12.30', date: purchase.date, time: '13:00' }, summary: { account: 'Test Card', category: 'Spending' } });
    committed++;
    return Response.json({ id: randomUUID(), transaction_id: transactionId, status: 'recorded', persisted: true, duplicate: false });
  };
  const id = randomUUID(), transactionId = randomUUID();
  let handler = makeSmsWorker(config(dir), async () => { parsed++; return purchase; }, fetcher);
  assert.equal((await handler(request(id))).status, 201);
  handler = makeSmsWorker(config(dir), async () => { throw new Error('must not reparse'); }, fetcher);
  const result = await (await handler(request(id))).json();
  assert.equal(result.transaction_id, transactionId);
  assert.equal((await handler(request(id, { ...input, sms: 'changed' }))).status, 409);
  assert.equal(parsed, 1); assert.equal(committed, 1);
}));

test('unknown commit outcome retains identical payload across restart', async () => fixture(async dir => {
  const id = randomUUID();
  const bodies: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === 'preview') return Response.json({ request_id: id, persisted: false, date: purchase.date, digest: 'b'.repeat(64), entry: { amount: '12.30', date: purchase.date, time: '13:00:00' }, summary: { account: 'Test Card', category: 'Spending' } });
    bodies.push(String(init?.body));
    if (bodies.length === 1) throw new Error('timeout after upstream save');
    return Response.json({ id: randomUUID(), transaction_id: randomUUID(), status: 'recorded', persisted: true, duplicate: true });
  };
  let handler = makeSmsWorker(config(dir), async () => purchase, fetcher);
  assert.equal((await handler(request(id))).status, 503);
  handler = makeSmsWorker(config(dir), async () => { throw new Error('unexpected reparse'); }, fetcher);
  assert.equal((await handler(request(id))).status, 200);
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
}));

test('preview reinterpretation prevents a commit', async () => fixture(async dir => {
  let commits = 0;
  const handler = makeSmsWorker(config(dir), async () => purchase, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === 'commit') commits++;
    return Response.json({ persisted: false, entry: { amount: '999.00' } });
  });
  assert.equal((await handler(request(randomUUID()))).status, 422);
  assert.equal(commits, 0);
}));

test('a leased request rejects concurrent retries before another parse', async () => fixture(async dir => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const wait = new Promise<void>(r => { release = r; });
  const handler = makeSmsWorker(config(dir), async () => { entered(); await wait; return { ...purchase, kind: 'unsupported' }; });
  const id = randomUUID();
  const first = handler(request(id));
  await started;
  assert.equal((await handler(request(id))).status, 429);
  release(); await first;
}));

test('date/time, currency, and exact positive amount are checked outside AI', () => {
  assert.equal(validPurchase(purchase, input), true);
  assert.equal(validPurchase({ ...purchase, date: '2026-10-09' }, { ...input, received_at: '2026-10-14T13:01:00+08:00' }), false);
  assert.equal(validPurchase({ ...purchase, time: null }, input), false);
  assert.equal(validPurchase({ ...purchase, currency: 'USD' }, input), false);
  assert.equal(validPurchase({ ...purchase, amount: '0.00' }, input), false);
  assert.equal(validPurchase({ ...purchase, merchant: 'Invented merchant' }, input), false);
  assert.equal(validPurchase({ ...purchase, amount: '777.00' }, input), false);
  assert.equal(validPurchase({ ...purchase, last4: '1111' }, input), false);
});

test('OpenAI uses the cheap model and strict bounded output; incomplete and conflicting classifications fail closed', async () => {
  let output: unknown = purchase, status = 'completed';
  const client = { responses: { create: async (body: Record<string, unknown>) => {
    assert.equal(body.model, 'gpt-5-nano');
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 1000);
    assert.deepEqual(body.reasoning, { effort: 'minimal' });
    assert.equal(body.tools, undefined);
    const text = body.text as { format: { strict: boolean } };
    assert.equal(text.format.strict, true);
    return { status, output_text: JSON.stringify(output) };
  } } } as unknown as OpenAI;
  assert.deepEqual(await parseWithOpenAI(input, client), purchase);
  output = { ...purchase, kind: 'unsupported' };
  await assert.rejects(parseWithOpenAI(input, client), /ai_classification_conflict/);
  status = 'incomplete';
  await assert.rejects(parseWithOpenAI(input, client), /ai_unavailable/);
});
