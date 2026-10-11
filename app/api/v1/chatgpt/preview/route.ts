import { handleChatGptQuickLog } from '@/lib/finance/quick-log/chatgpt';
import { POST as quickLog } from '../../quick-log/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const serverToken = process.env.FINANCE_DOT_SERVER_KEY ?? process.env.FINANCE_DOT_TEST_KEY;
  return handleChatGptQuickLog(request, 'preview', quickLog, serverToken);
}
