import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { quickTime } from './http';
import { dateOnly } from '../core';
import { InputError, json, readJson } from '../sms/http';

const text = z.string().trim().min(1).max(1000);
const previewInput = z.object({ text, time: quickTime.optional() }).strict();
const commitInput = z.object({
  text,
  time: quickTime.optional(),
  request_id: z.uuid(),
  date: dateOnly,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** Public Dot expense calls use a fixed server credential. Caller credentials
 * never select the owner; the existing scoped RPC still validates each save.
 */
export async function handleChatGptQuickLog(
  request: Request,
  action: 'preview' | 'commit',
  forward: (request: Request) => Promise<Response>,
  serverToken?: string,
) {
  try {
    const input = (action === 'preview' ? previewInput : commitInput).safeParse(await readJson(request));
    if (!input.success) return json({ error: action === 'preview' ? 'Provide expense text and an optional Manila time (HH:mm or HH:mm:ss)' : 'Use the unchanged preview retry object' }, 400);
    const value: z.infer<typeof previewInput> & Partial<z.infer<typeof commitInput>> = input.data;
    const requestId = value.request_id ?? randomUUID();
    const headers = new Headers({ 'Content-Type': 'application/json', 'Idempotency-Key': requestId });
    if (!serverToken || !/^ft_quick_[a-f0-9]{64}$/.test(serverToken)) return json({ error: 'Expense logging is not configured' }, 503);
    headers.set('authorization', `Bearer ${serverToken}`);
    for (const name of ['origin']) {
      const header = request.headers.get(name);
      if (header !== null) headers.set(name, header);
    }
    const response = await forward(new Request(request.url, {
      method: 'POST', headers,
      body: JSON.stringify({
        text: value.text, action,
        ...(value.time !== undefined ? { time: value.time } : {}),
        ...(action === 'commit' ? { date: value.date, digest: value.digest } : {}),
      }),
    }));
    if (!response.ok || action === 'commit') return response;
    const preview = await response.json();
    return json({ ...preview, retry: {
      request_id: preview.request_id, text: value.text, ...(value.time !== undefined ? { time: value.time } : {}), date: preview.date, digest: preview.digest,
    } });
  } catch (error) {
    return error instanceof InputError ? json({ error: error.message }, error.status) : json({ error: 'Quick log unavailable' }, 503);
  }
}
