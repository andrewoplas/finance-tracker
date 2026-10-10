---
name: finance-quick-log
description: Parse and record explicitly requested personal PHP expenses in Andrew's Finance Tracker using shorthand such as Badminton queue 250pesos. Reuse server-learned choices and clarify ambiguous accounts; examples and setup discussions do not authorize saving.
---

Use the bundled executable HTTP client through the shell tool. This is a callable script integration, not a remote MCP connection. Read [the API setup guide](references/api.md) when installing or configuring it.

Let the server resolve the account from consistent reviewed matching expenses, or the only active owned account. Do not invent Cash, RCBC, a wallet, or a last-used account. An explicit exact owned account name at the end overrides learning; RCBC works only when the server finds one matching owned account. Ask for the full account name on account_required/account_ambiguous. Learning requires the conversational quick-log migration; older servers still require explicit accounts.

Only handle personal purchases here. Payments, repayments, refunds, declines, OTPs, shared/reimbursable expenses, transfers and uncertain events require clarification or the app's existing workflows. Never send bank credentials, a full card number, CVV or OTP.

Amounts must be explicit positive exact PHP decimals. The server accepts `250pesos`, `PHP250`, `₱250` and `250 pesos`. Dates default to owner-local today (Asia/Manila). Use a full YYYY-MM-DD date for historical expenses; do not infer a year from an incomplete date. Let the server resolve categories/tags from reviewed matching expenses and its existing-category vocabulary. Inspect the resolved preview; do not fabricate taxonomy. In legacy `exp` shorthand, standalone `food` selects the unique Food tag. `#Tag`, `category:Name` and `category:"Food & Dining"` select existing unique owned names. Unknown or ambiguous values require clarification.

1. Verify readiness with `python3 <skill-root>/scripts/quick_log.py status`. This reads local configuration only. If unavailable, explain the precise setup step. Do not generate/configure keys or expand access without action-time authorization; prefer Settings → Transaction API self-service key creation.
2. For an actual request to log an expense, pass the exact text to `python3 <skill-root>/scripts/quick_log.py preview` as a JSON object on stdin: `{"text":"exp badminton food 210 cash"}`. The client assigns a UUID. No write occurs. Server errors about account, amount, date, tags or category require clarification. Use JSON stdin, never shell-interpolate finance text or keys.
3. Check the preview's exact amount, date, account and tags against the request. A request such as “log exp …” authorizes saving the matching entry; examples, tests and explanation requests do not. When a choice remains uncertain, ask before commit.
4. Feed the preview's returned `retry` object unchanged to `python3 <skill-root>/scripts/quick_log.py commit` on stdin. Retain this exact object and UUID in the conversation until a successful receipt. Following a timeout or unknown outcome, retry this same object once; if still uncertain, stop and report that saving is unconfirmed. Never generate a new UUID to retry.
5. Report saved only for `status=recorded`, `persisted=true`, with a transaction ID. `needs_review` is held outside spending totals: link the [review inbox](https://finance-tracker-eosin-eight.vercel.app/dashboard/inbox). Do not retry held items as new writes. Corrections/undo use the app's audited Transactions workflow.

Installation alone does not authorize access or prove a live connection. State separately whether the skill is discoverable, the client is executable, a private key is configured, and an authenticated request was verified. Never paste a key into chat, commit it, or print it.
