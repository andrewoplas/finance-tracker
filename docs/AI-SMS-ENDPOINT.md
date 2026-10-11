# Credit-card notification HTTP API

`POST https://finance.andrewoplas.com/api/v1/card-notifications`

This new web-app endpoint accepts raw SMS, parses it with OpenAI, and records
valid PHP purchases through the existing audited quick-log preview/commit flow.
No Codex worker or subscription login is needed. The existing regex-based
`/api/v1/card-transactions` endpoint remains separate.

## Activation

1. Apply `20261011020000_ai_sms_requests.sql`. It requires the existing
   quick-log migrations, including the
   expense time/category upgrades. It creates only a private request checkpoint
   table and a token-authenticated RPC; no credentials or expenses are created.
2. Configure server-side environment variables and deploy the new route:

```dotenv
OPENAI_API_KEY=<OpenAI-platform-key>
FINANCE_SMS_HTTP_KEY=<32-or-more-random-secret-characters>
FINANCE_DOT_SERVER_KEY=<existing-active-ft_quick_expense-key>
FINANCE_SMS_MODEL=gpt-5-nano
FINANCE_SMS_CARD_MAPPINGS={"2004":{"account":"RCBC Flex Visa","category":"Spending"}}
```

Use the exact owned account and category names. The configured default category
applies to all purchases for that card; these are recorded as personal expenses.
Only the server holds the OpenAI and Finance write keys. The phone sends the
separate HTTP bearer key. Revoking the underlying Finance credential disables
parsing and replay as well as saving.

GPT-5 nano has the lowest listed standard token rates among the models checked:
$0.05/M input and $0.40/M output. It supports structured output but is deprecated
with shutdown scheduled for December 11, 2026. Change `FINANCE_SMS_MODEL` to
`gpt-6-luna` for its replacement ($0.10/M input, $0.50/M output). The implementation
allows these two models and never silently falls back to a more expensive one.
Sources: [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano),
[deprecations](https://developers.openai.com/api/docs/deprecations),
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

## Request

```http
Authorization: Bearer <FINANCE_SMS_HTTP_KEY>
Content-Type: application/json
```

```json
{
  "sms": "Your transaction at CBTL SM STORE CEBU on 10/10 5:43PM for PHP195.00 using your Card ending in xxxx2004 is approved."
}
```

Send one complete SMS (up to 2,000 UTF-8 bytes). `received_at` is optional;
if supplied, use the actual receipt timestamp with its timezone offset. Do not send an `Origin` header. The server generates a stable UUID from the
trimmed SMS text, scoped to the configured Finance credential. Identical SMS
text reuses the same request, even across deployments. Distinct messages with
identical text are therefore treated as duplicates, including across years.
Keep the exact body for retries, including `received_at` if supplied.

`Idempotency-Key` is optional. Existing callers can still supply a UUID; an
invalid supplied value returns 400. Keep that UUID unchanged on retries.
Do not switch between supplying and omitting the header for the same request.

HTTP 201 with `status:"recorded"`, `persisted:true`, and `transaction_id` confirms
a new expense. An identical successful retry returns HTTP 200 with the same
receipt and `duplicate:true`. Existing Finance duplicate checks can return
`needs_review`, `persisted:false`, with an inbox ID for review in the app.

Promotions, OTPs, declines, refunds, repayments, transfers, cash advances and
installment notices are ignored. Missing/conflicting fields, ambiguous dates,
non-PHP currency and missing purchase times are not saved. A missing year uses the current year in Asia/Manila; an explicit year is
preserved. If `received_at` is supplied, the purchase must fall within 72 hours
before it or five minutes after it. Purchase time is never copied from receipt time. These extraction issues return
`needs_review`, `persisted:false`, and the parsed fields; they do not create an
inbox entry, so inspect the response and log manually if appropriate.

Unknown card endings return 422 `card_not_configured`. A mismatch between the
parsed fields and Finance's preview returns 422 `preview_mismatch`; no commit
is sent. Merchant selector syntax is sanitized; input cannot choose categories
or accounts. Account/category ownership is enforced by Finance.

## Retry and cost controls

Requests authenticate and consume the Finance credential quota before OpenAI is
called. The existing 20/minute and 200/day quota is shared with quick-log; a new
save also consumes its preview/commit allowances. Replays of final results do
not call AI. Concurrent retries of the same request return 429. A private
database lease expires after 150 seconds if the HTTP request crashes.

The parsed result and exact commit payload are checkpointed before saving.
Network timeouts or HTTP 503 can mean the upstream save succeeded: retry the
identical request. Never change the idempotency header or edit the body to work around an
uncertain save. Backend idempotency returns the existing transaction.

401 means wrong/revoked credentials; 400/413/415 mean invalid request/body type;
409 means a request/lease/Finance conflict; 422 means a mapping or preview issue;
429 means busy or rate limited (wait 60 seconds); 503 means configuration,
OpenAI, Finance or checkpoint storage is unavailable. A `persisted:false` error
does not prove an uncertain commit failed; preserve the original request.

Only the SMS, server current year, and optional receipt timestamp are sent to OpenAI, with `store:false`, strict
JSON output, no tools, minimal reasoning, a 1,000-output-token limit, a 45-second
timeout and SDK retries disabled. The raw SMS and credentials are not logged or
stored in the checkpoint table. Derived fields and receipts are retained there
for safe retries. No ledger history is fetched or sent to OpenAI.

## Verification boundaries

HTTP and disposable PostgreSQL tests cover authentication, quotas, credential
isolation, revocation, leases, checkpoint immutability, mismatched previews,
duplicate replay, and uncertain commits.

Production activation and deployment were verified October 11, 2026. The
configured OpenAI key accessed GPT-5 nano and correctly extracted two supplied
RCBC notifications and rejected a promotion. Public HTTP checks returned 401
without the bearer, ignored a promotion without saving, replayed the same result,
and rejected an altered payload with the same UUID (409). Save/retry behavior
passed mocked HTTP and disposable PostgreSQL tests; no test expense was saved
to the production ledger. Phone automation execution remains unverified.
