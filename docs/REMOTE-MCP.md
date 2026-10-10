# Remote expense logging MCP — implementation and activation handoff

This branch adds `/api/mcp/expenses`, a disabled-by-default remote Streamable HTTP MCP for chat expense logging. `/api/mcp` remains the existing localhost/session adapter. The new endpoint exposes exactly `expense_context`, `expense_preview`, and `expense_commit`; there are no balance, ledger-search, credential, transfer, edit, delete or undo tools.

**Status: implemented and tested locally; authorized for branch push and an isolated disabled Vercel preview only.** `activationApproved=false` in `lib/mcp/remote/config.ts` forces MCP off and its effective client allowlist empty, even if hosting settings request activation. A separately approved code change is required to unlock future staging/production OAuth tests; environment flags alone cannot do it. No OAuth clients, secrets, consents, integration rows or live expenses were created. The eight separately pending Cash entries were not used or imported. The other SMS task/workspace was not modified.

## Expense contract

- One personal PHP expense per call. `account_id` is mandatory even if there is only one account or consistent history. Read owned account IDs/names from `expense_context`; the caller must obtain an explicit user account selection. There is no account-learning fallback.
- Amounts are decimal strings with at most two decimal places, normalized to two places using PostgreSQL `numeric(12,2)`. Dates are full valid `YYYY-MM-DD`; an omitted preview date resolves to Asia/Manila today. Future dates are rejected. The retry object freezes the resolved date across midnight.
- Categories and tags must already belong to the owner. The context returns their IDs/names only, without history or balances. Missing category means uncategorized, not invented taxonomy.
- Preview returns `persisted:false`, an exact `retry` object, and up to ten owned duplicate candidates with matching account/amount within one day of the expense date. A larger match set requires app review. The digest binds owner, integration, request, resolved expense, account/category names, decision and current duplicate candidates.
- Commit accepts the exact retry object with `intent:log_expense`. A matching actual user instruction authorizes saving; examples, setup discussions, hypothetical entries and a digest do not. Tool descriptions explicitly prohibit logging examples. The server cannot infer real conversational consent from a caller-supplied boolean or intent string; the invoking agent must enforce that boundary.
- A commit with possible duplicates and default `duplicate_decision:review` produces an immutable `needs_review`, `persisted:false` receipt and **no ledger row**. Show the candidates to the user. Only after they explicitly confirm a separate purchase, create a fresh request/preview with `confirmed_separate`. There is no automatic duplicate override or ledger administration tool. This review lives in the conversation, independently of the older quick-log inbox.
- Commit rechecks the duplicate set. A changed set or altered preview requires a fresh preview before anything is written.
- A recorded result requires `persisted:true` and a valid durable `transaction_id`. The transaction, existing audit/balance/tag triggers, and receipt insert share one database transaction. Failure rolls everything back.
- Receipts live in a private table keyed by **owner + stable integration ID + request UUID**. Exactly the same commit payload returns the original receipt, including after an account is renamed/archived. Changed payload returns `idempotency_conflict`. Retry with the same ID and payload after a timeout; never manufacture a new ID for an ambiguous save. JSON key ordering is insignificant. Preserve integration rows/IDs across ordinary reconnects; never delete receipt history.
- Per-integration persistent quotas allow 60 context/preview/commit calls per minute and 500 per Manila day. Completed identical retries do not consume quota. Add deployment-level limits for authentication/protocol traffic; database quotas do not protect unauthenticated traffic.

## OAuth and database boundaries

`lib/mcp/remote/auth.ts` verifies asymmetric JWT signatures using only the pinned Supabase issuer's JWKS, plus issuer, expiry, issue time, not-before, user/session UUIDs, explicit client allowlist, non-anonymous user, dedicated `finance_mcp` role, signed resource binding and expense capabilities. JWKS outages fail closed with 503; invalid tokens receive a 401 discovery challenge. Browser cookies, API keys, ID tokens and ordinary Supabase session tokens cannot authenticate this endpoint. Hostile Origin and query-token URLs are rejected; server clients may omit Origin. Request bodies are limited to 16 KB. Tokens, financial payloads and upstream exception bodies are not logged by this adapter.

The protected-resource document is at `/.well-known/oauth-protected-resource/api/mcp/expenses`. Its canonical resource is the full expense MCP URL; the 401 challenge points to that document. Both modern MCP discovery and legacy stateless Streamable HTTP are supported by the existing official SDK. There are no long-lived MCP sessions or subscriptions. Each request has its own identity closure.

Supabase's `openid`, `email`, `profile` and `phone` scopes govern identity disclosure; **they do not limit database privileges**. This adapter advertises `openid` and enforces separate signed finance capabilities and database authorization. It does not advertise unsupported custom OAuth scopes.

`supabase/proposals/remote_expense_mcp.sql` is a **review-only proposal, outside the migration directory**. It is not automatically deployed. It requires the core finance schema through tags/planned items, but does **not** require activating either SMS or quick-log credentials. It:

1. Creates a dedicated non-login, non-inheriting database role with no broad table access; the Data API's `authenticator` can assume it from verified JWTs. The public expense RPC is an invoker wrapper around a single bounded private definer implementation. It never changes JWT claims to impersonate an owner and never uses a service-role key or general owner RPC.
2. Adds restrictive OAuth-denial policies to existing public tables, preserving ordinary direct-session ownership policies. Existing non-trigger public definer RPCs receive a client-ID guard because they bypass RLS. Existing OIDs/signatures are retained. PUBLIC function execution is removed while existing explicit role grants are preserved, and new functions from the applying role require explicit grants. Inspect this security change against the actual deployment before applying it. The proposal aborts on owner-rights public views, unsupported definer languages or a preexisting role.
3. Adds empty private integration/receipt tables with RLS and no API table grants. An integration is an explicit owner/client/resource/issuer mapping, disabled by default, with expiry and a valid-after cutoff. No owner or OAuth client is hardcoded or provisioned.
4. Supplies a private Supabase Custom Access Token Hook. It preserves regular sign-ins, denies unapproved OAuth clients, and maps approved OAuth issuances/refreshes to `finance_mcp` with client-pinned `finance_mcp_resource` and expense capabilities. `aud=authenticated` is retained for the Supabase Data API. MCP validates the signed resource claim instead of treating that broad audience as sufficient. No authorization comes from user-editable metadata.
5. Checks the live integration, OAuth client, user/client-bound `auth.sessions` row, session expiry, and non-revoked `auth.oauth_consents` row on **every** RPC, including receipt retries. Disabling an integration or revoking its consent/session blocks outstanding tokens. The consent UI is `/oauth/consent`; the owner can revoke grants at `/oauth/connections`. Server actions recheck the session/client, and callbacks are pinned to the exact builder-provided redirect URI.

The role restriction, hook, table policies and legacy RPC guards must be reviewed and activated together **before enabling OAuth clients against the finance database**. OAuth must not be enabled as a shortcut around the current owner policies. Future migrations must preserve these restrictions and explicit grants; rerun the security tests with new schema/RPC additions. Do not replay old core/SMS/quick-log migrations over an existing database to install this feature.

Turning off `FINANCE_MCP_REMOTE_ENABLED` disables the HTTP adapter, not already-issued tokens at the Data API. To revoke access durably, revoke the provider consent/session or disable the integration row; SQL checks these on every call. The owner revocation page remains available when the HTTP adapter is disabled.

## What was actually verified

Local tests use synthetic users/expenses in fresh, disposable PGlite databases. They cover official-client modern/legacy discovery and three-tool schemas, signed JWT validation, auth challenges and unavailable infrastructure, strict arguments/missing accounts, foreign account/category/tag rejection, ordinary-owner RLS preservation, OAuth RLS and legacy RPC denial, exact PHP/date behavior, duplicate review/stale preview handling, rollback/audit, durable original-receipt retries, changed-payload conflicts, per-owner/per-integration namespaces, quota enforcement, revocation, hook output and redirect safety. No production writes are needed for these tests. Simultaneous retry calls in PGlite verify the receipt path, but are not a multi-connection Postgres contention benchmark.

Validation on Node 24.19.0: `npm test` passed 56 TypeScript tests and 3 Python tests; the final targeted remote suite passed all 9 tests after the last security/boundary changes. `npm run typecheck` and `npm run build` passed. `npm run lint` exited successfully with 0 errors and 11 warnings in unchanged files. The production-build local HTTP smoke test, simulating TLS termination with a synthetic localhost resource, returned 200/no-store for protected-resource discovery, 401 plus the discovery challenge without a token, 403 for hostile Origin, and 404 for the still-disabled local MCP adapter. No live Auth/Data API calls were used in that smoke test. Next.js normalizes loopback request hosts to `localhost`; the local smoke resource matched that normalization. Verify the canonical public host on the actual deployment as part of staging.

Read-only Supabase connector inspection on 2026-10-10 found the repository-documented finance project `nbssibquqrkwuyhxzbyg` (`financial-tracker-brain`) healthy. Core/tag/planned-item objects and transaction columns exist; all five finance views have `security_invoker=true`. The two public non-trigger definer RPCs are PL/pgSQL. There were zero OAuth clients, no `finance_mcp` role and no quick-log request table. Recorded migration history contains six February entries and does not describe the later core/tag schema; reconcile by schema/definitions, not migration names alone. Verify that the deployment's configured project URL matches this project before setup. No expense/account content or credentials were fetched.

Live discovery/JWKS GETs could not be verified: this execution environment's outbound proxy returned 403, and the browsing tool could not access those project URLs. That is **not proof that OAuth is disabled or that the provider is incompatible**. The repository's local OAuth-server setting remains disabled. Provider documentation supports OAuth/PKCE and client-specific hooks, but live resource-parameter handling, actual hook events/refresh behavior, signing algorithms, auth grant revocation semantics and Data API role mapping remain staging gates.

Run the read-only checker from an allowed network:

```sh
node --import tsx scripts/check-remote-mcp-provider.ts
```

It reads `NEXT_PUBLIC_SUPABASE_URL`, fetches only discovery/JWKS, checks the exact issuer, authorization code/refresh grants, S256, identity scope, client authentication methods and asymmetric signing metadata, and prints no key material. It never creates credentials. Passing it is necessary but is not a token-flow or permission proof.

## Approval sequence and smallest next step

**Smallest next approval:** authorize an isolated staging deployment for the provider/discovery proof, with an empty client allowlist and no finance integration rows. Empty allowlist supports discovery/bootstrap while rejecting every token. Use a disposable Supabase project containing synthetic data. Selecting/creating that project, deploying, or changing its Auth configuration requires separate authorization. If existing project discovery can be read from an allowed network first, that check itself needs no write approval.

After reviewing that result, separately approve the staged SQL/hook activation, one predefined OAuth client, one synthetic-owner integration mapping, and a staging consent grant. Do not create a production grant to test provider behavior. Keep DCR disabled and copy the exact callback URI shown by the personal-plugin builder; do not guess a stable callback.

Run database advisors after staged SQL activation, then verify in staging:

1. Public discovery, S256, exact callback and issuer handling, requested scopes, asymmetric signatures and refresh rotation. Confirm the provider accepts/handles the MCP `resource` parameter at authorization **and** token exchange. A wrong-resource request must not yield a token usable by another resource. If stock provider behavior cannot meet the MCP contract, stop and choose an approved compatible issuer/adapter; do not relax validation.
2. Actual authorization-code and refresh tokens contain the approved `client_id`, dedicated role and signed exact resource. The hook must also apply to refreshes. Confirm the ordinary app session's role/access remains unchanged.
3. Actual PostgREST requests with OAuth tokens cannot read balances/ledger, mutate tables, call owner/credential RPCs or reach another owner; missing-account commits fail. Exercise two concurrent connections and the same request ID with same/different payloads. All expense fixtures stay in staging.
4. Revoke the grant via `/oauth/connections`, delete/expire the session and disable the integration independently; old tokens and receipt retries must fail each time. Verify provider schema assumptions against the observed Auth version.
5. Refresh dot/plugin tools and successfully call `expense_context` and `expense_preview` without committing any example. A locally installed skill or plugin card alone is not evidence that the dot has callable tools.

Only then request production approval for the reviewed SQL security changes, hook configuration, one production OAuth client and exact redirect, one owner/client integration grant with expiry, deployment, and enabling the endpoint. This is separate from any SMS-only migration approval. No broad `supabase db push` is appropriate with this repository's pending migrations and differing production history. When the proposal is ready to become an activation migration, use `supabase migration new remote_expense_mcp` with the CLI, review the generated file and exact target schema, and apply only that approved change through the supported database workflow.

Server settings, after their corresponding approvals:

```text
FINANCE_MCP_REMOTE_ENABLED=true
FINANCE_MCP_RESOURCE=https://finance-tracker-eosin-eight.vercel.app/api/mcp/expenses
FINANCE_MCP_CLIENT_IDS=<one explicitly registered OAuth client UUID>
FINANCE_MCP_REDIRECT_URI=<exact callback displayed in the plugin builder>
NEXT_PUBLIC_SUPABASE_URL=<verified project origin>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing public project key, never a service key>
```

Set the provider's authorization path to `/oauth/consent`, its Site URL to the matching deployment, use asymmetric signing, enable the reviewed private hook, and insert the separately approved owner/client integration mapping with the exact issuer/resource and bounded expiry. Do not insert credentials or grants from examples in this guide. Keep `FINANCE_MCP_LOCAL_ENABLED` unchanged. Configure proxy/platform logging to redact Authorization, cookies, codes and finance bodies, and add edge request limits before production enablement.

## Personal plugin / dot installation, after setup

The documented OpenAI flow is ChatGPT **Plugins → plus → Add custom MCP server**, name the plugin and use the canonical `/api/mcp/expenses` HTTPS URL, select **OAuth** and the pre-registered client setup, then **Create as a plugin**. Use the builder's actual OAuth callback when registering the client. Install the resulting plugin from personal plugins, complete the consent flow, open a fresh Work conversation, and invoke it with `@`. Then verify the exact three expense tools are callable in Andrew's dot and make authenticated context/preview calls. Do not report the integration as connected based on local skill installation, code deployment or an unauthenticated HTTP response.

The first live save must be an independently authorized real expense with an explicit account. Its returned transaction ID is the end-to-end proof; a synthetic example or the eight pending entries are not authorized test data.

## Official references checked

- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth): protected-resource discovery, issuer/resource validation, PKCE, predefined client support and exact callback handling.
- [OpenAI personal MCP plugin quickstart](https://developers.openai.com/plugins/quickstart): create/install a personal custom MCP plugin and test a real tool invocation.
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) and [OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started).
- [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security) and [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook): identity scopes versus database rights and client-specific signed claims.
- [Supabase changelog](https://supabase.com/changelog): reviewed OAuth token endpoint 2xx change, Data API table-exposure changes, and current Node/TypeScript requirements. This branch uses Node 24/TypeScript 5 and explicit database grants.

Installed SDK declarations/source were checked for stateless transport, per-request factories, body limits, Supabase OAuth consent/revocation methods and JWT verification.
