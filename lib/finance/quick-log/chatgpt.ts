import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dateOnly } from '../core';
import { InputError, json, readJson } from '../sms/http';

const text = z.string().trim().min(1).max(1000);
const previewInput = z.object({ text }).strict();
const commitInput = z.object({
  text,
  request_id: z.uuid(),
  date: dateOnly,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** Actions use a JSON retry object, rather than a custom idempotency header.
 * Forward locally through the same scoped HTTP boundary. During temporary Dot
 * testing, the server supplies its configured key when the caller sends none.
 */
export async function handleChatGptQuickLog(
  request: Request,
  action: 'preview' | 'commit',
  forward: (request: Request) => Promise<Response>,
  testToken?: string,
) {
  try {
    const input = (action === 'preview' ? previewInput : commitInput).safeParse(await readJson(request));
    if (!input.success) return json({ error: action === 'preview' ? 'Provide only expense text' : 'Use the unchanged preview retry object' }, 400);
    const value: z.infer<typeof previewInput> & Partial<z.infer<typeof commitInput>> = input.data;
    const requestId = value.request_id ?? randomUUID();
    const headers = new Headers({ 'Content-Type': 'application/json', 'Idempotency-Key': requestId });
    for (const name of ['authorization', 'origin']) {
      const header = request.headers.get(name);
      if (header !== null) headers.set(name, header);
    }
    if (!headers.has('authorization') && testToken && /^ft_quick_[a-f0-9]{64}$/.test(testToken)) {
      headers.set('authorization', `Bearer ${testToken}`);
    }
    const response = await forward(new Request(request.url, {
      method: 'POST', headers,
      body: JSON.stringify({
        text: value.text, action,
        ...(action === 'commit' ? { date: value.date, digest: value.digest } : {}),
      }),
    }));
    if (!response.ok || action === 'commit') return response;
    const preview = await response.json();
    return json({ ...preview, retry: {
      request_id: preview.request_id, text: value.text, date: preview.date, digest: preview.digest,
    } });
  } catch (error) {
    return error instanceof InputError ? json({ error: error.message }, error.status) : json({ error: 'Quick log unavailable' }, 503);
  }
}
