import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReflection, matchesReflectionKey, type Reflection, type ReflectionStore } from '../lib/finance/reflections';
import { reflectionStore } from '../lib/finance/reflection-store';
import type { SupabaseClient } from '@supabase/supabase-js';

const endpoint = 'https://finance.example/api/v1/reflections/2026-10';
const key = `ft_reflection_${'a'.repeat(64)}`;
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(endpoint, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
test('privileged store scopes reads and upserts to the configured owner and month', async () => {
  const calls: unknown[][] = [];
  const result = { data: { month: '2026-10', notes: 'Notes', updated_at: 'now' }, error: null };
  const query = {
    select: (fields: string) => { calls.push(['select', fields]); return query; },
    eq: (field: string, value: string) => { calls.push(['eq', field, value]); return query; },
    maybeSingle: async () => result,
    upsert: (row: unknown, options: unknown) => { calls.push(['upsert', row, options]); return query; },
    single: async () => result,
  };
  const db = { from: (table: string) => { calls.push(['from', table]); return query; } } as unknown as SupabaseClient;
  const store = reflectionStore(db, 'fixed-owner');
  await store.read('2026-10');
  assert.deepEqual(calls, [['from', 'retro_plans'], ['select', 'month,notes,updated_at'], ['eq', 'user_id', 'fixed-owner'], ['eq', 'month', '2026-10']]);
  calls.length = 0;
  await store.save('2026-09', 'Previous month');
  const row = calls[1][1] as unknown as Record<string, string>;
  assert.equal(row.user_id, 'fixed-owner');
  assert.equal(row.month, '2026-09');
  assert.equal(row.notes, 'Previous month');
  assert.deepEqual(calls[1][2], { onConflict: 'user_id,month' });
  assert.deepEqual(calls[2], ['select', 'month,notes,updated_at']);
});
test('reflection keys require the dedicated namespace and exact bearer value', () => {
  assert.equal(matchesReflectionKey(`Bearer ${key}`, key), true);
  for (const value of ['', `Bearer ${key}x`, `bearer ${key}`, `Bearer ft_quick_${'a'.repeat(64)}`, `Bearer ft_reflection_${'b'.repeat(64)}`]) {
    assert.equal(matchesReflectionKey(value, key), false);
  }
  assert.equal(matchesReflectionKey('Bearer short', 'short'), false);
});
test('invalid month, origin and authorization cannot read or write the store', async () => {
  let calls = 0;
  const authorize = async () => { calls++; return new Response(null, { status: 401 }); };
  assert.equal((await handleReflection(request({ notes: 'Notes' }), '2026-13', authorize)).status, 400);
  assert.equal((await handleReflection(request({ notes: 'Notes' }, { Origin: 'https://other.example' }), '2026-10', authorize)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await handleReflection(request({ notes: 'Notes' }), '2026-10', authorize)).status, 401);
  assert.equal(calls, 1);
});
test('monthly upserts preserve other months, support retries and return saved notes', async () => {
  const rows = new Map<string, Reflection>();
  const store: ReflectionStore = {
    read: async month => rows.get(month) ?? null,
    save: async (month, notes) => {
      const row = { month, notes, updated_at: '2026-10-11T00:00:00Z' };
      rows.set(month, row); return row;
    },
  };
  const run = (req: Request, month = '2026-10') => handleReflection(req, month, async () => store);
  assert.equal((await run(new Request(endpoint))).status, 404);
  await run(request({ notes: 'September notes' }), '2026-09');
  for (let i = 0; i < 2; i++) {
    const result = await run(request({ notes: 'October notes' }));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).persisted, true);
  }
  await run(request({ notes: 'Updated October' }));
  const result = await run(new Request(endpoint));
  assert.equal((await result.json()).reflection.notes, 'Updated October');
  assert.equal(rows.get('2026-09')?.notes, 'September notes');
  assert.equal(rows.size, 2);
});
test('reject owner overrides, empty notes, oversized notes and malformed request bodies', async () => {
  let writes = 0;
  const store: ReflectionStore = { read: async () => null, save: async () => { writes++; throw new Error('Unexpected write'); } };
  const run = (req: Request) => handleReflection(req, '2026-10', async () => store);
  for (const body of [{ notes: ' ' }, { notes: 'x'.repeat(5001) }, { notes: 'Notes', user_id: 'other-owner' }, { month: '2026-09', notes: 'Notes' }]) {
    assert.equal((await run(request(body))).status, 400);
  }
  assert.equal((await run(request({ notes: 'x'.repeat(24001) }))).status, 413);
  assert.equal((await run(new Request(endpoint, { method: 'PUT', body: '{}' }))).status, 415);
  assert.equal((await run(new Request(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal(writes, 0);
});
test('database failures never report persistence or expose their details', async () => {
  const store: ReflectionStore = { read: async () => { throw new Error('secret database details'); }, save: async () => { throw new Error('secret database details'); } };
  for (const req of [new Request(endpoint), request({ notes: 'Notes' })]) {
    const result = await handleReflection(req, '2026-10', async () => store);
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: 'Reflections unavailable' });
  }
});
