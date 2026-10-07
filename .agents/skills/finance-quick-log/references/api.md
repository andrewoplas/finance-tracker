# Finance Tracker ingestion setup

Production origin: https://finance-tracker-eosin-eight.vercel.app
Settings: /dashboard/settings#transaction-api. Review: /dashboard/inbox.

## Two separate scopes

SMS keys (`ft_sms_…`) can submit approved RCBC messages only to the review inbox for one explicitly mapped owner/card/last four. They cannot post a purchase or read history. Quick-log keys (`ft_quick_…`) can preview and create validated personal expenses into owned accounts. They cannot read transaction history, amend, undo, transfer, or dismiss duplicates. Both expire in 90 days and can be revoked in Settings. Only hashes are stored. An owner actively checks the matching acknowledgement and clicks Create key; this is the credential creation authorization.

Install this skill folder in `~/.codex/skills/finance-quick-log` for personal discovery, or use the repository `.agents/skills/finance-quick-log` in that checkout. Refresh the invoking session before expecting newly installed skill discovery. The actual callable route is `python3 <skill-root>/scripts/quick_log.py`; the skill is not a connected remote MCP server. `/api/mcp` remains the existing disabled localhost session adapter.

After approving a quick-log client, create its key yourself in Settings. Store only the key in `~/.config/finance-tracker/quick-log-key`, owned by you with mode 600. The executable also accepts `FINANCE_QUICK_LOG_KEY_FILE` pointing at an explicitly approved private file. Do not paste it into chat or add it to the repo. The URL is fixed to the published HTTPS origin; redirects are refused. TLS certificates are verified with the native macOS CA bundle when needed; Linux uses the standard Python trust store. `status` verifies only local configuration, never a live authenticated connection. `preview` is an authenticated read/no-write action; verify that before claiming connection. An actual authorized save plus returned transaction ID is the end-to-end proof. Do not save a synthetic example into production to test the connection without permission.

## Generic HTTP

Every POST uses `Content-Type: application/json`, `Authorization: Bearer YOUR_SCOPED_KEY`, and `Idempotency-Key: UUID`. Preserve the UUID and exact JSON body when retrying after a timeout. Keys and request/SMS content must be excluded from caller/access logs; use only status, duration and opaque receipt IDs for observability.

`POST /api/v1/card-transactions`:

```json
{"sms":"Your transaction at SYNTHETIC MARKET on 10/07 3:38AM for PHP123.45 using your Card ending in xxxx1234 is approved.","received_at":"2026-10-07T03:40:00+08:00"}
```

This is synthetic documentation, not a save instruction. Supply the actual receipt timestamp with an explicit offset. Parsing is deterministic; no AI or bank API is involved. Only this RCBC approved purchase template and the known bank safety footer are accepted. PANs, CVVs, OTPs, passwords, refunds, repayments, declines, installments, and uncertain events are rejected. The original SMS is not stored; only parsed merchant, amount, masked last four, bounded date context, and hashes are retained. HTTP and upstream providers may have their own logging; configure payload/authorization redaction there too.

SMS dates are resolved in Asia/Manila against `received_at`, within 72 hours before receipt and five minutes after it. The actual receipt must also be within 72 hours of submission (five-minute future tolerance). Year-less, late, impossible or ambiguous dates are held for a full-date decision. A normalized parsed-event fingerprint deduplicates exact SMS resubmissions even with a new UUID, another valid key or formatting/footer changes. Possible repeated purchases remain distinct inbox items requiring an explicit separate-purchase decision. All accepted SMS require date/category/personal-share review before recording. Receipt response has `id`, `status`, `duplicate`, `persisted`; `needs_review` does not count as spending.

`POST /api/v1/quick-log` preview:

```json
{"text":"exp badminton food 210 cash","action":"preview"}
```

The response includes `entry`, `date`, `digest`, `request_id`, `persisted:false`. No entry is saved. Commit with the same header UUID and:

```json
{"text":"exp badminton food 210 cash","action":"commit","date":"DATE_FROM_PREVIEW","digest":"DIGEST_FROM_PREVIEW"}
```

The date binds owner-local today across midnight/retries; explicit YYYY-MM-DD within the text is preserved. The digest binds the exact resolved entry, not consent. The caller needs actual authorization to log. Account must be a suffix in every entry. Exact owned account names and unique RCBC prefix alias work; no fuzzy guessing or default account. Positive amounts have at most two decimals, without separators/currency signs. Compact `food`, `#Tag` and `category:Name` resolve existing unique owned values only. Description words are preserved after removing only those explicit fields. Refunds, payments, transfers, shared expenses and relative/incomplete dates require other workflows/clarification. A recorded response includes `transaction_id`, `persisted:true`. Possible duplicates return `needs_review`, `persisted:false` and must be reviewed in the app. SQL ownership/references and audit/undo are shared with the app's existing operation.

SMS limits: 2,000 bytes per SMS, 4,096-byte JSON body, 10 new requests/minute and 100/day/key, 500 pending owner receipts. Quick-log limits: 1,000 bytes of text, 4,096-byte JSON body, 20 preview/commit calls/minute and 200/day/key, 500 pending owner duplicates. Completed identical retries do not consume new quota. Invalid authenticated requests do consume quota. 401 means invalid/expired/revoked key; 409 conflict/queue limit; 422 clarification/rejected event; 429 quota (`Retry-After: 60`); 503 unavailable/unconfirmed. HTTP callers must avoid blind new-ID retries.

## Possible Apple Shortcut

Create a personal Message automation for the bank sender and purchase template. Read the incoming message, capture its actual receipt time with an ISO 8601 timezone offset, and assign one stable UUID for that event. Use Get Contents of URL → POST with the headers/body above, storing the key privately. Preserve the UUID, body and receipt timestamp for retries; a retry's current time is not its receipt time. If the automation cannot expose a trustworthy receipt timestamp, use a manual Shortcut with an explicit receipt time; do not silently substitute the run time. Capture the response ID/status and open the review inbox. Check the device's automation confirmation settings and protect the Shortcut from export/sharing with its key. Shortcut installation and credential storage require the owner's approval. Core ingestion works with any correctly authenticated HTTP client.

Official references: [Apple communication triggers](https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/ios), [Apple request API](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios).
