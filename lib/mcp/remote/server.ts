import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { commitSchema, previewSchema, receiptSchema, type RemoteRpc } from './contracts';
import { AuthenticationUnavailable, metadata, metadataUrl, validConfig, type Principal, type RemoteConfig } from './auth';

const failure = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
export function protectedResource(config: RemoteConfig) {
  if (!config.enabled) return failure(404, 'Remote MCP is disabled');
  if (!validConfig(config)) return failure(503, 'Remote MCP is not configured');
  return Response.json(metadata(config), { headers: { 'Cache-Control': 'no-store' } });
}

export function remoteExpenseMcp(deps: {
  config: RemoteConfig;
  authenticate: (token: string) => Promise<Principal>;
  rpc: (principal: Principal) => RemoteRpc;
}) {
  return async (request: Request): Promise<Response> => {
    const { config } = deps;
    if (!config.enabled) return failure(404, 'Remote MCP is disabled');
    if (!validConfig(config)) return failure(503, 'Remote MCP is not configured');
    const url = new URL(request.url), origin = new URL(config.resource).origin;
    if (url.origin + url.pathname !== config.resource || url.search ||
      (request.headers.has('origin') && request.headers.get('origin') !== origin)) return failure(403, 'Origin rejected');
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return failure(405, 'Method not allowed', { Allow: 'GET, POST, DELETE' });
    const challenge = { 'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl(config)}", scope="openid"` };
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!match || match[1].length > 12000) return failure(401, 'OAuth access token required', challenge);
    let principal: Principal;
    try { principal = await deps.authenticate(match[1]); }
    catch (error) {
      return error instanceof AuthenticationUnavailable ? failure(503, 'Token verification service unavailable')
        : failure(401, 'Invalid OAuth access token', challenge);
    }
    let rpc: RemoteRpc;
    try {
      rpc = deps.rpc(principal);
      const active = await rpc('authorize', {}) as { authorized?: boolean };
      if (active?.authorized !== true) return failure(401, 'OAuth access revoked or unavailable', challenge);
    } catch { return failure(503, 'Authorization service unavailable'); }
    // Per-request identity closure: never store user tokens in global SDK state.
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'finance-tracker-expenses', version: '1.0.0' });
      async function invoke(action: 'context' | 'preview' | 'commit', args: Record<string, unknown>) {
        try {
          const value = await rpc(action, args);
          if (!value || typeof value !== 'object') throw new Error('Invalid result');
          if (action === 'commit' && !('error' in value)) receiptSchema.parse(value);
          return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], isError: 'error' in value };
        } catch {
          return { content: [{ type: 'text' as const, text: 'Finance service unavailable. Saving is unconfirmed. Retain and retry the exact request ID and payload; never claim saved without a transaction ID.' }], isError: true };
        }
      }
      server.registerTool('expense_context', {
        description: 'Get active owned account IDs/names, expense categories/tags, PHP and Asia/Manila today. No balances or ledger. Ask which account to use if the user has not explicitly selected one; never infer even a sole account.',
        inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, openWorldHint: false },
      }, async () => invoke('context', {}));
      server.registerTool('expense_preview', {
        description: 'Preview one personal PHP expense without saving. Requires an explicitly selected owned account. Returns a date-bound retry object and possible duplicate matches. Show choices and resolve ambiguity before commit. Examples and setup requests are never save instructions.',
        inputSchema: previewSchema, annotations: { readOnlyHint: true, openWorldHint: false },
      }, async args => invoke('preview', args));
      server.registerTool('expense_commit', {
        description: 'Save only an actual user-authorized expense using the exact preview retry object. Digest is integrity, not consent. Never log examples. Retain the same request ID AND payload after timeouts; changed payload conflicts. needs_review is NOT saved: review matches with the user before a fresh confirmed_separate preview. Say saved only with persisted=true AND a durable transaction_id.',
        inputSchema: commitSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async args => invoke('commit', args));
      return server;
    }, { legacy: 'stateless', responseMode: 'auto', maxRequestBodySize: 16000, maxSubscriptions: 0 });
    try {
      const response = await handler.fetch(request);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } finally { await handler.close(); }
  };
}
