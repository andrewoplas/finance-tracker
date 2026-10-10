# Dot HTTP testing

Dot calls `POST /api/v1/chatgpt/preview` with `{"text":"<description> <amount> Cash"}` and then `POST /api/v1/chatgpt/commit` with the returned `retry` object unchanged. Both requests use `Content-Type: application/json`. Include the exact owned account name in testing text; the unconditional Cash default is not implemented yet.

For temporary header-free testing, configure these **server-only** settings:

```dotenv
FINANCE_DOT_TEST_MODE=true
FINANCE_DOT_TEST_KEY=<a scoped quick-log key for the intended owner>
```

When no Authorization header is supplied, the two Dot endpoints use this server-held key. A supplied invalid header remains invalid. With the mode off, or without a valid configured key, the caller must supply its normal bearer key. The generic `/api/v1/quick-log`, SMS and MCP endpoints keep their existing authentication.

Enabling this mode on a public host allows anyone who can reach these two endpoints to submit expenses to the configured owner's ledger. It provides no caller identity. The configured credential still limits owner, rate, expiry, revocation and permitted operations; validation, duplicate review, audit and idempotent receipts use the original database path. There is one RPC per request, without an extra owner lookup or service-role client.

Preview does not save an expense. Commit requires the exact preview date, digest, text and UUID. After a timeout, retry the same object. Report saved only for `persisted:true` with a valid transaction ID; `needs_review` is held for app review. Examples are not instructions to save test expenses in production.

To restore caller authentication, set `FINANCE_DOT_TEST_MODE=false` and restart/redeploy the app. Revoke the server-held test credential when testing is finished. No SQL migration is needed for this HTTP change.
