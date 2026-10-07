# Ingestion API and quick-log skill

See the canonical [setup guide](../.agents/skills/finance-quick-log/references/api.md) for HTTP contracts, scope/credential setup, safe retries, and possible Shortcut setup. The callable skill is [finance-quick-log](../.agents/skills/finance-quick-log/SKILL.md).

Activation migrations: `20261007070000_card_sms_inbox.sql` and `20261007190256_quick_log.sql`. Both are additive and repeatable; they create no keys or ledger entries. Production application requires explicit action-time approval because they enable new persistent scoped access. Existing historical data, tags/backfill, balance baselines and plans are untouched.

Verification before activation:

- Full synthetic suite: 42 Node/PostgreSQL tests and 3 Python executable-client tests passed.
- Final ingestion changes: 8 parser/API/database tests passed, covering owner isolation, scope, exact decimals, replay, duplicate inbox, audited saves/review, revocation and repeatable migrations.
- Typecheck and Webpack production build passed. Lint: 0 errors and 11 inherited unused-code warnings.
- Official skill-creator validator passed in a disposable Python environment; executable tests use injected HTTP responses and transmit no samples externally.
- Supported IAB checked desktop and 390×844 synthetic inbox/setup layouts, unresolved dates/possible duplicates, explicit key-scope acknowledgement, and disabled synthetic writes/key creation. No horizontal overflow.
- Read-only production preflight confirmed the audited ledger, tags and compatible auth.uid claim binding; neither ingestion RPC/schema was active. Baseline Supabase advisors have existing search-path, GraphQL discovery, intentional authenticated ledger RPC, and password-protection warnings.
- No credentials, production samples, ledger changes, resets/imports, or taxonomy backfills were performed for implementation verification. Live authenticated ingestion and Shortcut execution remain setup verification after approval.
