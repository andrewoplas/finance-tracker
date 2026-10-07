import { z } from 'zod';

export const smsInput = z.object({
  sms: z.string().min(1).max(2000),
  received_at: z.iso.datetime({ offset: true, precision: undefined }).max(40),
}).strict();
export const credentialInput = z.object({
  account_id: z.uuid(), last4: z.string().regex(/^\d{4}$/),
  label: z.string().trim().min(1).max(60), acknowledged: z.literal(true),
}).strict();
export const reviewInput = z.object({
  id: z.uuid(), revision: z.number().int().positive(), action: z.enum(['record', 'dismiss']),
  values: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    report_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    category_id: z.uuid().nullable(), tag_ids: z.array(z.uuid()).max(50),
    attribution: z.enum(['personal','shared','reimbursable']),
    personal_amount: z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/),
    confirm_distinct: z.boolean(),
  }).strict().optional(),
}).strict().refine(value => value.action !== 'record' || !!value.values);
export const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
});
export class InputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Bound streamed bodies before JSON parsing; never put request values into errors. */
export async function readJson(request: Request, maxBytes = 4096): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new InputError(415, 'Use application/json');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new InputError(413, 'Request too large');
  if (!request.body) throw new InputError(400, 'Invalid JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new InputError(413, 'Request too large'); }
      chunks.push(value);
    }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(400, 'Invalid JSON');
  } finally { reader.releaseLock(); }
}
export type SmsRpc = (args: { p_token: string; p_request_id: string; p_sms: string; p_received_at: string }) => Promise<{ data: unknown; error: unknown }>;
const receiptSchema = z.object({id: z.uuid(), status: z.enum(['needs_review','recorded','dismissed']), duplicate: z.boolean(), persisted: z.boolean()}).strict();
const statuses: Record<string, number> = { unauthorized:401, idempotency_conflict:409, rate_limited:429, inbox_full:409,
  invalid_input:400, received_at_requires_offset:422, invalid_received_at:422, unsupported_message:422, invalid_amount:422, card_mismatch:422 };
export async function handleCardSms(request: Request, submit: SmsRpc) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({error:'origin_rejected'},403);
  const token = request.headers.get('authorization')?.match(/^Bearer (ft_sms_[a-f0-9]{64})$/)?.[1];
  if (!token) return json({error:'unauthorized'},401);
  const requestId = z.uuid().safeParse(request.headers.get('idempotency-key'));
  if (!requestId.success) return json({error:'Idempotency-Key must be a UUID'},400);
  try {
    const input = smsInput.safeParse(await readJson(request));
    if (!input.success) return json({error:'Provide sms and received_at with an explicit timezone offset'},400);
    const result = await submit({p_token:token,p_request_id:requestId.data,p_sms:input.data.sms,p_received_at:input.data.received_at});
    if (result.error) return json({error:'SMS ingestion unavailable'},503);
    if (result.data && typeof result.data === 'object' && 'error' in result.data) {
      const code = String(result.data.error);
      if (!(code in statuses)) return json({error:'SMS ingestion unavailable'},503);
      const response = json({error:code},statuses[code]);
      if (code === 'rate_limited') response.headers.set('Retry-After','60');
      return response;
    }
    const receipt = receiptSchema.safeParse(result.data);
    if (!receipt.success) return json({error:'SMS ingestion unavailable'},503);
    return json(receipt.data,receipt.data.duplicate ? 200 : 202);
  } catch (error) {
    return error instanceof InputError ? json({error:error.message},error.status) : json({error:'SMS ingestion unavailable'},503);
  }
}
