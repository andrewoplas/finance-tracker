# Local MCP adapter

`/api/mcp` is a disabled-by-default, localhost-only MCP transport adapter. It is **not a connected chat integration**, OAuth resource server, or remote bearer-token endpoint. No credentials, client registration, grants, live database setup, or deployment were created.

## Implemented contract

The official `@modelcontextprotocol/server` 2.3.1 SDK serves modern `2026-07-28` discovery and legacy stateless initialization through one endpoint. The matching official client verifies both modes. The SDK owns JSON-RPC parsing, protocol schemas, negotiation, method errors, notifications, and response transport. No stateful MCP session is issued; a fresh server is constructed per request. Subscriptions are disabled. Request bodies are bounded to 100,000 bytes.

Tools:

| Tool | Input | Effect |
| --- | --- | --- |
| `finance_context` | Empty object | Owned accounts, wallets, categories, currency/date context |
| `finance_search` | `month` | Complete bounded activity for one report month |
| `finance_report` | `month` | Deterministic monthly totals |
| `finance_audit` | Transaction `id` | Owned audit history for revision-safe corrections |
| `finance_preview` | `request_id`, `operation` | Validated canonical operation and digest; no writes |
| `finance_commit` | Exact preview payload plus `digest` | Atomic shared financial operation |

Input schemas are generated from the existing strict Zod contracts. Amend, reverse, undo, staged/committed imports, installment/shared workflows, and reconciliation use their existing operation variants through preview/commit, not separate unvalidated write paths. Monetary strings and Manila/date-only semantics are unchanged. Financial failures are MCP tool results with `isError`; protocol failures use SDK protocol errors. Unknown keys, including caller-selected owner IDs, are rejected. Tool annotations describe effects but are not authorization or user consent. The digest binds payload integrity only; the caller must obtain user authorization before commit.

MCP dispatches directly to the existing authenticated finance handlers, without an outbound HTTP request. REST and MCP share `financialOperation` for validation, digest, and atomic RPC invocation. The regular Supabase anonymous-key/session client and database RLS/owner checks remain authoritative. There is no service-role client or token pass-through to another service.

## Local configuration boundary

Both server-only settings are required to opt in:

```
FINANCE_MCP_LOCAL_ENABLED=true
FINANCE_MCP_LOCAL_ORIGIN=http://127.0.0.1:4317
```

These settings were **not enabled** in the running application. Bind the server to localhost. The configured origin must be an exact origin with a loopback hostname; request URL and `Origin` must match it. Missing/foreign Origin is rejected. Bearer headers are explicitly rejected; there is no fallback to an unverified token. Every request must pass the existing app's `auth.getUser()` session check before protocol discovery/execution, and finance handlers recheck authentication before accessing data. Missing/invalid session returns 401, authentication infrastructure failure returns 503, disabled endpoint returns 404. No identity comes from tool arguments or an MCP session ID.

This cookie-session boundary is a local adapter for an already signed-in app, not interoperable remote MCP OAuth. The synthetic harness models revoked authorization by rejecting the next request; it does not establish Supabase's real revocation latency. Existing JWT/session invalidation semantics need verification before enabling any integration.

## Verification

`npm test` includes a local official protocol client using an injected Fetch transport, real SDK request/response processing, synthetic authentication, and a fresh PGlite database with migrations 001–006. No TCP listener or live Supabase is needed. This proves modern discovery, legacy initialization, six-tool schema discovery, preview/commit, incorrect digest rejection, idempotent retry without duplicate ledger rows, wrong-owner account rejection, undo restoring the exact opening balance, strict arguments, malformed JSON, unknown tools, unsupported DELETE, domain failure results, and denial when authorization becomes invalid. Separate boundary cases cover disabled endpoint, missing/revoked/unavailable authentication, missing/hostile Origin, and unconfigured bearer tokens. Existing RLS, revision, import, settlement, and rollback database tests remain in the same suite.

This is not a live PostgREST/auth integration test. The existing app UI and database migrations were preserved. No new UI screenshot is needed for this transport-only milestone.

## Remaining remote integration work

Before remotely connecting an assistant, choose and approve the authorization server and canonical HTTPS resource URL. Implement protected-resource metadata, OAuth issuer discovery, resource/audience-bound token validation, expiration/revocation checks, least-privilege read/write scopes, and an authorized mapping to a user's Supabase/RLS session. Do not accept an arbitrary Supabase token as an MCP-audience token or forward a foreign token. Add client metadata/pre-registration and PKCE/consent flow as appropriate; credentials/grants and external connection require approval. Test the real auth provider, revoked tokens, PostgREST permissions, and concurrent owners on a disposable database before enabling remote serving. Add deployment-level rate limits and observability without financial payload logging. The localhost guard must not simply be removed to publish this adapter.

Primary references reviewed:

- [Official SDK protocol versions and serving both eras](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Current MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Legacy Streamable HTTP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

The installed SDK README and type declarations were also inspected for the current factory, body limit, stateless fallback, and per-request authentication boundary.
