import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { cardMappings, makeSmsHandler, StateStore } from '@/lib/finance/ai-sms/http';
import { parseWithOpenAI, SMS_MODEL } from '@/lib/finance/ai-sms/parser';
import { InputError, json } from '@/lib/finance/sms/http';
import { POST as quickLog } from '../quick-log/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = process.env.FINANCE_SMS_HTTP_KEY, financeToken = process.env.FINANCE_DOT_SERVER_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.FINANCE_SMS_MODEL || SMS_MODEL;
  const cards = cardMappings.safeParse(parseMappings(process.env.FINANCE_SMS_CARD_MAPPINGS));
  if (!url || !key || !apiKey || !token || token.length < 32 || !financeToken
    || !/^ft_quick_[a-f0-9]{64}$/.test(financeToken) || !cards.success || !Object.keys(cards.data).length
    || !['gpt-5-nano', 'gpt-6-luna'].includes(model)) return json({ error: 'SMS ingestion not configured' }, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const store: StateStore = async (action, id, hash, lease, state = {}) => {
    const { data, error } = await db.rpc('checkpoint_ai_sms', {
      p_token: financeToken, p_request_id: id, p_hash: hash, p_lease: lease, p_action: action, p_state: state,
    });
    if (error || !data || typeof data !== 'object') throw new InputError(503, 'sms_store_unavailable');
    if (data.error) {
      const statuses: Record<string, number> = { unauthorized: 401, idempotency_conflict: 409, busy: 429, rate_limited: 429, lease_lost: 409 };
      throw new InputError(statuses[data.error] || 503, data.error);
    }
    return data;
  };
  const client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 0 });
  return makeSmsHandler({ token, financeToken, cards: cards.data },
    input => parseWithOpenAI(input, client, model), store, quickLog)(request);
}

function parseMappings(value?: string): unknown {
  try { return JSON.parse(value || '{}'); } catch { return null; }
}
