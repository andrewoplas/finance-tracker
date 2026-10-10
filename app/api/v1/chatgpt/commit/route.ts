import { handleChatGptQuickLog } from '@/lib/finance/quick-log/chatgpt';
import { POST as quickLog } from '../../quick-log/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const testToken = process.env.FINANCE_DOT_TEST_MODE === 'true' ? process.env.FINANCE_DOT_TEST_KEY : undefined;
  return handleChatGptQuickLog(request, 'commit', quickLog, testToken);
}
