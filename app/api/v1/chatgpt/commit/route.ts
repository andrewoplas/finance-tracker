import { handleChatGptQuickLog } from '@/lib/finance/quick-log/chatgpt';
import { POST as quickLog } from '../../quick-log/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleChatGptQuickLog(request, 'commit', quickLog);
}
