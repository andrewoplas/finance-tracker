import { remoteConfig } from '@/lib/mcp/remote/config';
import { protectedResource } from '@/lib/mcp/remote/server';
export const dynamic = 'force-dynamic';
export const GET = () => protectedResource(remoteConfig());
