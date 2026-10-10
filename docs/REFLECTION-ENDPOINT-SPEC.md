# Monthly reflection endpoint for Dots

Base URL: `https://finance.andrewoplas.com`. Server configuration and deployment are required before this new endpoint is available live.

Use `GET /api/v1/reflections/YYYY-MM` to read one month and `PUT /api/v1/reflections/YYYY-MM` to create or replace its notes. The month is explicit, including for previous months. Each owner has one reflection per month; repeated PUT requests replace that same record rather than create duplicates. Concurrent edits use the last successful write.

## Authentication and configuration

Dots sends `Authorization: Bearer <reflection-key>`. This is a dedicated reflection key, separate from expense, SMS and quick-log keys. It accesses only the server-configured owner. Requests cannot select another owner. Invalid bearer credentials never fall back to session authentication. The app can also use its signed-in session without a bearer header.

Configure these project-level server environment values, locally in ignored `.env.local` and in the hosting project's environment when publishing:

- `FINANCE_DOT_REFLECTION_KEY`: `ft_reflection_` followed by 64 lowercase hexadecimal characters generated from 32 cryptographically random bytes.
- `FINANCE_DOT_REFLECTION_OWNER_ID`: the intended owner's profile UUID.
- `SUPABASE_SERVICE_ROLE_KEY`: the project's server-only service-role key.

The existing `NEXT_PUBLIC_SUPABASE_URL` is also required. Never use a `NEXT_PUBLIC_` prefix for the three new values, commit them, or give Dots the service-role key. Give Dots only the dedicated reflection key. No global shell configuration is needed. The endpoint uses the existing `retro_plans` table; no new migration is required.

## Write

```http
PUT /api/v1/reflections/2026-10
Authorization: Bearer <reflection-key>
Content-Type: application/json

{"notes":"October reflection: Spending stayed within my plan. Next month I will review subscriptions."}
```

Only `notes` is accepted: a non-empty string, at most 5,000 characters. Whitespace-only notes, extra fields, financial data and owner overrides are rejected. Request bodies are bounded to 24,000 bytes.

Successful response (`200`):

```json
{"reflection":{"month":"2026-10","notes":"October reflection: Spending stayed within my plan. Next month I will review subscriptions.","updated_at":"2026-10-11T00:00:00.000Z"},"persisted":true}
```

Report saved only after a successful response containing `persisted: true`. This saves notes and never creates transactions or changes balances.

## Read

```http
GET /api/v1/reflections/2026-09
Authorization: Bearer <reflection-key>
```

Successful response (`200`) has the same `reflection` object. A missing month returns `404` with `{"error":"reflection_not_found","month":"2026-09"}`; it does not mean the database failed.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid month, notes or JSON |
| 401 | Invalid/missing credentials |
| 403 | Cross-origin browser request rejected |
| 404 | No saved reflection for this month |
| 413 | Request body too large |
| 415 | PUT requires `application/json` |
| 503 | Server configuration or database access unavailable |

Responses are not cached. Dots should keep the draft on failure and avoid claiming persistence. The Reports page's month picker displays and edits previous months using the same records.
