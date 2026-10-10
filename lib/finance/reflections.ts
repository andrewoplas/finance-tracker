import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { monthOnly } from './core';
import { InputError, json, readJson } from './sms/http';

export type Reflection = { month: string; notes: string; updated_at: string };
export type ReflectionStore = {
  read: (month: string) => Promise<Reflection | null>;
  save: (month: string, notes: string) => Promise<Reflection>;
};
const input = z.object({ notes: z.string().max(5000).refine(value => value.trim().length > 0) }).strict();
export function matchesReflectionKey(authorization: string, key: string) {
  if (!/^ft_reflection_[a-f0-9]{64}$/.test(key)) return false;
  const expected = Buffer.from(`Bearer ${key}`), actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function handleReflection(request: Request, month: string, authorize: () => Promise<ReflectionStore | Response>) {
  if (!monthOnly.safeParse(month).success) return json({ error: 'Use a month in YYYY-MM format' }, 400);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin_rejected' }, 403);
  try {
    const store = await authorize();
    if (store instanceof Response) return store;
    if (request.method === 'GET') {
      const reflection = await store.read(month);
      return reflection ? json({ reflection }) : json({ error: 'reflection_not_found', month }, 404);
    }
    const parsed = input.safeParse(await readJson(request, 24000));
    if (!parsed.success) return json({ error: 'Provide only non-empty notes, up to 5000 characters' }, 400);
    return json({ reflection: await store.save(month, parsed.data.notes), persisted: true });
  } catch (error) {
    return error instanceof InputError ? json({ error: error.message }, error.status) : json({ error: 'Reflections unavailable' }, 503);
  }
}
