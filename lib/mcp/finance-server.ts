import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { requestSchema } from '../finance/contracts';
import { monthOnly } from '../finance/core';

export type FinanceDispatch = (request: Request, action: string) => Promise<Response>;
export type McpDependencies = {
  enabled: boolean;
  origin: string;
  authenticate: (request: Request) => Promise<boolean>;
  dispatch: FinanceDispatch;
};
const failure = (status: number, message: string) => Response.json(
  { error: message }, { status, headers: { 'Cache-Control': 'no-store' } },
);

/** Local session adapter only. Never accepts bearer tokens or creates sessions. */
export function financeMcp(deps: McpDependencies) {
  const handler = createMcpHandler(({ requestInfo }) => {
    const server = new McpServer({ name: 'personal-finance', version: '0.1.0' });
    async function invoke(action: string, args: Record<string, unknown>, write = false) {
      const url = new URL(`/api/finance/${action}`, deps.origin);
      const headers = new Headers(requestInfo?.headers);
      headers.delete('content-length');
      headers.set('content-type', 'application/json');
      const { digest, ...body } = args;
      if (typeof digest === 'string') headers.set('x-finance-preview', digest);
      else headers.delete('x-finance-preview');
      if (!write) for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
      try {
        // Direct handler dispatch: no outbound request, token forwarding, or service-role client.
        const response = await deps.dispatch(new Request(url, {
          method: write ? 'POST' : 'GET', headers,
          ...(write ? { body: JSON.stringify(body) } : {}),
        }), action);
        const value = await response.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], isError: !response.ok };
      } catch {
        return { content: [{ type: 'text' as const, text: 'Finance service unavailable. No successful commit is confirmed; retry with the same request ID.' }], isError: true };
      }
    }
    const reads = [
      ['finance_context', 'context', 'Read owned accounts, wallets, categories and Manila date context.', z.object({}).strict()],
      ['finance_search', 'search', 'Read complete bounded ledger activity for one report month.', z.object({ month: monthOnly }).strict()],
      ['finance_report', 'report', 'Deterministic monthly report; transfers and collections are distinct from earned income.', z.object({ month: monthOnly }).strict()],
      ['finance_audit', 'audit', 'Read owned transaction history needed to select a revision-safe undo.', z.object({ id: z.uuid() }).strict()],
    ] as const;
    for (const [name, action, description, inputSchema] of reads) server.registerTool(name, {
      description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false },
    }, async (args: Record<string, unknown>) => invoke(action, args));
    server.registerTool('finance_preview', {
      description: 'Validate and preview an operation without writes. Covers create, amend, reverse, undo, staged import and settlement workflows. Show the result to the user before commit. Digest is integrity, not user consent.',
      inputSchema: requestSchema, annotations: { readOnlyHint: true, openWorldHint: false },
    }, async args => invoke('preview', args, true));
    server.registerTool('finance_commit', {
      description: 'Commit the exact previewed operation only after user authorization. Preserve request_id on ambiguous outcomes/retries. Owner checks, revisions, audit, rollback and undo are enforced by the shared database operation.',
      inputSchema: requestSchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async args => invoke('commit', args, true));
    return server;
  }, { legacy: 'stateless', responseMode: 'auto', maxRequestBodySize: 100000, maxSubscriptions: 0 });
  return {
    close: handler.close,
    async fetch(request: Request) {
      if (!deps.enabled) return failure(404, 'MCP is disabled');
      let configured: URL;
      try { configured = new URL(deps.origin); } catch { return failure(503, 'Local MCP origin is not configured'); }
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(configured.hostname) || configured.origin !== deps.origin)
        return failure(503, 'Only an explicit localhost origin is supported');
      if (new URL(request.url).origin !== deps.origin || request.headers.get('origin') !== deps.origin)
        return failure(403, 'Origin rejected');
      if (request.headers.has('authorization')) return failure(401, 'Bearer authentication is not configured');
      try {
        if (!await deps.authenticate(request)) return failure(401, 'Authenticated app session required');
      } catch { return failure(503, 'Authentication unavailable'); }
      const response = await handler.fetch(request);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    },
  };
}
