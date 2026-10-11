# Ingestion API and quick-log skill

For raw bank notifications parsed through OpenAI, see [AI SMS HTTP setup](AI-SMS-ENDPOINT.md).

For conversational expenses in a dedicated ChatGPT GPT, see [ChatGPT setup](CHATGPT.md). The additive `20261010000000_conversational_quick_log.sql` upgrade accepts peso shorthand and learns consistent account/category/tag choices from reviewed matching expenses. It requires the original ingestion migrations below. The GPT Actions schema is `public/chatgpt-actions.json`; connection and key configuration remain separate setup steps.

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

## Expense categories and times

Apply `20261011000000_expense_time_category.sql`, then `20261011010000_quick_log_time_category.sql` before deploying the matching API update. Both replace functions only; existing ledger entries and inbox records are unchanged.

Quick-log preview requires an owned expense category (explicit, consistently learned, or an unambiguous existing category match). Otherwise it returns HTTP 422 `category_required`; clarify with `category:Spending` or a quoted name such as `category:"Food & Dining"` and preview again. Tags remain optional and do not replace a category.

Supply an explicit Manila time in the text (`Lunch 250 time:14:35 Cash`) or as an optional JSON `time` field (`HH:mm` or `HH:mm:ss`) on the quick-log or Dot preview/commit request. Use only one source of time. Invalid or multiple text times return `invalid_time` or `time_ambiguous`; invalid JSON time fields return HTTP 400. Missing times remain null; no time is inferred from history or receipt timestamps. Dot's returned retry object carries the optional time: submit it unchanged. Changing or removing the time requires a fresh preview. Reload the updated Actions schema to expose the optional JSON field to a GPT.
