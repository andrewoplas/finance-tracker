import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Purchase, SmsRequest, purchaseSchema, smsRequest, validPurchase } from './parser';
import { InputError, json, readJson } from '../sms/http';

const mapping = z.object({ account: z.string().trim().min(1).max(100), category: z.string().trim().min(1).max(100) }).strict();
export const cardMappings = z.record(z.string().regex(/^\d{4}$/), mapping);
export type SmsConfig = {
  token: string;
  cards: z.infer<typeof cardMappings>;
  financeToken: string;
};
type Retry = { text: string; time: string; action: 'commit'; date: string; digest: string };
export type State = { purchase?: Purchase; retry?: Retry; response?: { status: number; body: unknown } };
export type StateStore = (action: "claim" | "checkpoint" | "release", id: string, hash: string, lease: string, state?: State) => Promise<State>;
export type Parser = (input: SmsRequest) => Promise<Purchase>;
const receipt = z.object({
  id: z.uuid(), status: z.enum(['recorded', 'needs_review']), persisted: z.boolean(),
  duplicate: z.boolean(), transaction_id: z.uuid().optional(),
}).strict().refine(r => r.status === 'recorded' ? r.persisted && !!r.transaction_id : !r.persisted && !r.transaction_id);

// Use a constrained quoted selector; SMS cannot inject quick-log selectors.
function selector(value: string): string {
  if (/["\r\n]/.test(value)) throw new InputError(503, 'card_mapping_invalid');
  return `category:"${value}"`;
}

// Version-8 UUID from a credential-scoped SHA-256 digest. Stable across
// retries and deployments; no raw SMS or credential is exposed in the ID.
function smsRequestId(sms: string, financeToken: string): string {
  const bytes = createHash('sha256').update(JSON.stringify(['finance-sms-v1', financeToken, sms])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeSmsHandler(config: SmsConfig, parse: Parser, store: StateStore, forwardRequest: (request: Request) => Promise<Response>) {
  const expected = createHash('sha256').update(`Bearer ${config.token}`).digest();
  async function forward(id: string, body: unknown) {
    const response = await forwardRequest(new Request('https://finance.invalid/api/v1/quick-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.financeToken}`, 'Idempotency-Key': id },
      body: JSON.stringify(body),
    }));
    if (!response.ok) {
      // Retain the state, especially an uncertain commit; never regenerate IDs.
      if (response.status === 422) throw new InputError(422, 'finance_needs_review');
      if (response.status === 429) throw new InputError(429, 'finance_rate_limited');
      if (response.status === 409) throw new InputError(409, 'finance_conflict');
      throw new InputError(503, 'finance_unavailable');
    }
    return response.json();
  }
  return async function handle(request: Request): Promise<Response> {
    const actual = createHash('sha256').update(request.headers.get('authorization') ?? '').digest();
    if (!timingSafeEqual(actual, expected)) return json({ error: 'unauthorized' }, 401);
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/v1/card-notifications') return json({ error: 'not_found' }, 404);
    if (request.headers.has('origin')) return json({ error: 'origin_rejected' }, 403);
    const suppliedId = request.headers.get('idempotency-key');
    if (suppliedId !== null && !z.uuid().safeParse(suppliedId).success) return json({ error: 'Idempotency-Key must be a UUID' }, 400);
    let id = suppliedId ?? '';
    const lease = randomUUID();
    let hash = '', claimed = false;
    try {
      const input = smsRequest.safeParse(await readJson(request, 8192));
      if (!input.success || Buffer.byteLength(input.data.sms) > 2000) return json({ error: 'invalid_input' }, 400);
      id ||= smsRequestId(input.data.sms, config.financeToken);
      hash = createHash('sha256').update(JSON.stringify(input.data)).digest('hex');
      const state = await store('claim', id, hash, lease);
      claimed = true;
      const save = (value: State) => store('checkpoint', id, hash, lease, value);
      if (state.response) {
        const body = state.response.body as Record<string, unknown>;
        return json({ ...body, duplicate: true }, 200);
      }
      if (!state.purchase) {
        state.purchase = purchaseSchema.parse(await parse(input.data));
        await save(state);
      }
      const p = state.purchase;
      if (!validPurchase(p, input.data)) {
        const status = p.kind === 'unsupported' ? 'ignored' : 'needs_review';
        state.response = { status: 200, body: { status, persisted: false, purchase: p } };
        await save(state);
        return json(state.response.body);
      }
      const card = config.cards[p.last4!];
      if (!card) return json({ error: 'card_not_configured', persisted: false }, 422);
      if (!state.retry) {
        // Strip quick-log grammar from the description rather than letting an
        // SMS merchant select arbitrary dates, accounts, categories or tags.
        const merchant = p.merchant!.replace(/[^\p{L}\p{N} .&'()-]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (!merchant || /\d{4}-\d{2}-\d{2}|\b(?:time|category)\b/i.test(merchant)) return json({ error: 'merchant_needs_review', persisted: false }, 422);
        const text = `${merchant} ${p.amount} ${p.date} ${selector(card.category)} ${card.account}`;
        const preview = await forward(id, { text, time: p.time, action: 'preview' });
        // Backend resolves ownership and category. Verify it did not reinterpret
        // the model's amount, account, date or purchase time before committing.
        if (preview.persisted !== false || preview.request_id !== id || preview.date !== p.date
          || preview.entry?.amount !== p.amount || preview.entry?.date !== p.date
          || ![p.time, `${p.time}:00`].includes(preview.entry?.time)
          || preview.summary?.account !== card.account || preview.summary?.category !== card.category
          || !z.string().regex(/^[a-f0-9]{64}$/).safeParse(preview.digest).success) {
          throw new InputError(422, 'preview_mismatch');
        }
        state.retry = { text, time: p.time!, action: 'commit', date: preview.date, digest: preview.digest };
        // Durable before commit: a crash or HTTP timeout can only replay it.
        await save(state);
      }
      const result = receipt.parse(await forward(id, state.retry));
      state.response = { status: result.status === 'recorded' && !result.duplicate ? 201 : 200, body: { ...result, purchase: p } };
      await save(state);
      return json(state.response.body, state.response.status);
    } catch (error) {
      const response = error instanceof InputError ? json({ error: error.message, persisted: false }, error.status)
        : json({ error: 'sms_unavailable', persisted: false }, 503);
      if (response.status === 429) response.headers.set('Retry-After', '60');
      return response;
    } finally {
      if (claimed) await store('release', id, hash, lease).catch(() => {});
    }
  };
}
