import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';

test('SMS checkpoints authenticate, lease, isolate credentials, replay and preserve commit data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema finance_private;
      create table public.quick_log_credentials(id uuid primary key,user_id uuid,token_hash text,
        revoked_at timestamptz,expires_at timestamptz,minute_start timestamptz default now(),minute_count int default 0,
        day_start date default current_date,day_count int default 0,last_used_at timestamptz);`);
    const migration = await readFile('supabase/migrations/20261011020000_ai_sms_requests.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    const token = 'ft_quick_' + 'a'.repeat(64), other = 'ft_quick_' + 'b'.repeat(64);
    const credential = randomUUID();
    await db.query(`insert into quick_log_credentials(id,user_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day'),($4,$5,$6,now()+interval '1 day')`,
      [credential, randomUUID(), createHash('sha256').update(token).digest('hex'), randomUUID(), randomUUID(), createHash('sha256').update(other).digest('hex')]);
    const id = randomUUID(), lease = randomUUID(), hash = 'c'.repeat(64);
    const call = async (action = 'claim', key = token, state = {}, leaseId = lease, payload = hash) =>
      (await db.query<{ result: Record<string, unknown> }>('select checkpoint_ai_sms($1,$2,$3,$4,$5,$6::jsonb) result', [key, id, payload, leaseId, action, JSON.stringify(state)])).rows[0].result;
    assert.equal((await call('claim', 'invalid')).error, 'unauthorized');
    assert.deepEqual(await call(), {});
    assert.equal((await call('claim', token, {}, randomUUID())).error, 'busy');
    assert.deepEqual(await call('claim', other), {});
    assert.equal((await call('claim', token, {}, lease, 'd'.repeat(64))).error, 'idempotency_conflict');
    const parsed = { purchase: { merchant: 'Synthetic' } };
    assert.deepEqual(await call('checkpoint', token, parsed), parsed);
    assert.equal((await call('checkpoint', token, { purchase: { merchant: 'Changed' } })).error, 'checkpoint_conflict');
    await call('release');
    const secondLease = randomUUID();
    assert.deepEqual(await call('claim', token, {}, secondLease), parsed);
    assert.equal((await call('checkpoint', token, parsed, lease)).error, 'lease_lost');
    const retry = { ...parsed, retry: { text: 'Exact pending commit', digest: 'e'.repeat(64) } };
    assert.deepEqual(await call('checkpoint', token, retry, secondLease), retry);
    await db.exec(`update finance_private.ai_sms_requests set lease_until=now()-interval '1 second'`);
    assert.equal((await call('checkpoint', token, retry, secondLease)).error, 'lease_lost');
    const thirdLease = randomUUID();
    assert.deepEqual(await call('claim', token, {}, thirdLease), retry);
    const complete = { ...retry, response: { status: 201, body: { persisted: true } } };
    await call('checkpoint', token, complete, thirdLease);
    assert.deepEqual(await call('claim', token, {}, randomUUID()), complete);
    await db.query('update quick_log_credentials set revoked_at=now() where id=$1', [credential]);
    assert.equal((await call()).error, 'unauthorized');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from finance_private.ai_sms_requests'), /permission denied/);
  } finally { await db.close(); }
});

test('quota exhaustion prevents a new AI job', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema finance_private;
      create table quick_log_credentials(id uuid primary key,user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz,
        minute_start timestamptz,minute_count int,day_start date,day_count int,last_used_at timestamptz);`);
    await db.exec(await readFile('supabase/migrations/20261011020000_ai_sms_requests.sql', 'utf8'));
    const token = 'ft_quick_' + 'a'.repeat(64);
    await db.query(`insert into quick_log_credentials values($1,$2,$3,null,now()+interval '1 day',now(),20,(now() at time zone 'UTC')::date,0,null)`, [randomUUID(), randomUUID(), createHash('sha256').update(token).digest('hex')]);
    const result = await db.query<{ result: { error: string } }>('select checkpoint_ai_sms($1,$2,$3,$4,$5) result', [token, randomUUID(), 'c'.repeat(64), randomUUID(), 'claim']);
    assert.equal(result.rows[0].result.error, 'rate_limited');
    assert.equal((await db.query('select * from finance_private.ai_sms_requests')).rows.length, 0);
  } finally { await db.close(); }
});
