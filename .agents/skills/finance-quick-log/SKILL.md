---
name: finance-quick-log
description: Parse and record explicitly requested personal PHP expenses in Andrew's Finance Tracker using shorthand such as exp badminton food 210 cash. Clarify missing accounts and uncertain events; examples and setup discussions do not authorize saving.
---

Use the bundled executable HTTP client through the shell tool. This is a callable script integration, not a remote MCP connection. Read [the API setup guide](references/api.md) when installing or configuring it.

Every expense must include an explicit owned account at the end. There is no default account. Do not infer Cash, RCBC, a wallet, or a last-used account. Exact owned account names work; RCBC works only when the server finds one matching owned account. Ask for the full account name when missing or ambiguous.

Only handle personal purchases here. Payments, repayments, refunds, declines, OTPs, shared/reimbursable expenses, transfers and uncertain events require clarification or the app's existing workflows. Never send bank credentials, a full card number, CVV or OTP.

Amounts are positive exact decimal strings. Dates default to the server's owner-local today (Asia/Manila). Use a full YYYY-MM-DD date for historical expenses; do not infer a year from an incomplete date. Standalone `food` selects the unique existing Food tag. `#Tag` and `category:Name` select only existing unique owned names without spaces. Leave category uncategorized unless explicitly supplied; never derive it from a merchant. Unknown or ambiguous names ask for clarification and never create taxonomy.

1. Verify readiness with `python3 <skill-root>/scripts/quick_log.py status`. This reads local configuration only. If unavailable, explain the precise setup step. Do not generate/configure keys or expand access without action-time authorization; prefer Settings → Transaction API self-service key creation.
2. For an actual request to log an expense, pass the exact text to `python3 <skill-root>/scripts/quick_log.py preview` as a JSON object on stdin: `{"text":"exp badminton food 210 cash"}`. The client assigns a UUID. No write occurs. Server errors about account, amount, date, tags or category require clarification. Use JSON stdin, never shell-interpolate finance text or keys.
3. Check the preview's exact amount, date, account and tags against the request. A request such as “log exp …” authorizes saving the matching entry; examples, tests and explanation requests do not. When a choice remains uncertain, ask before commit.
4. Feed the preview's returned `retry` object unchanged to `python3 <skill-root>/scripts/quick_log.py commit` on stdin. Retain this exact object and UUID in the conversation until a successful receipt. Following a timeout or unknown outcome, retry this same object once; if still uncertain, stop and report that saving is unconfirmed. Never generate a new UUID to retry.
5. Report saved only for `status=recorded`, `persisted=true`, with a transaction ID. `needs_review` is held outside spending totals: link the [review inbox](https://finance-tracker-eosin-eight.vercel.app/dashboard/inbox). Do not retry held items as new writes. Corrections/undo use the app's audited Transactions workflow.

Installation alone does not authorize access or prove a live connection. State separately whether the skill is discoverable, the client is executable, a private key is configured, and an authenticated request was verified. Never paste a key into chat, commit it, or print it.
