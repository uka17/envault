# Email changes (API only, issue #49)

One API PR: storage, request/confirm/resend, tests/contracts. No frontend or worker behavior changes.

- `PATCH /api/v1/users/me` accepts optional `name` and `email`. A different email creates/replaces `pendingEmail`; the current `email` and `emailVerifiedAt` remain unchanged. Same pending email is idempotent and sends nothing while its token is still valid, including after delivery failure; use resend to retry. Once the token has expired, resubmitting the same address issues a new one. Submitting the current email cancels pending confirmation. Name-only updates do not consume the send budget.
- User responses include `pendingEmail: string | null`; token hashes, expiry and counters are excluded.
- `POST /api/v1/users/email-change/resend` requires authentication and no body. Sends to the current pending address; replaces the previous token.
- `POST /api/v1/users/email-change/confirm` takes `{ "token": "<64 lowercase hex characters>" }`, without authentication. The bearer token identifies its owning user and exact address; a logged-in browser cannot redirect it to another account. The email link is `BASE_URL/confirm-email-change?token=...`. The frontend must call this endpoint explicitly; GET/link scanners do not confirm anything.
- Tokens contain 32 random bytes, are stored only as SHA-256 hashes, expire in 30 minutes, and are independent of registration codes. Replacement, resend, cancellation and confirmation invalidate the previous token.
- Successful confirmation returns `200 {}`, clears the refresh cookie and revokes all sessions in the same transaction as the address change. Log in again with the new address. Concurrent login using a stale account snapshot cannot create a surviving session.
- Sending is limited in PostgreSQL per user: 60 seconds between attempts and 3 attempts per 15-minute window. Replacements and failed delivery count; cancellation does not reset the budget. Limits survive process restarts and work across replicas. Public confirmation also uses the existing IP verification limiter; proxy topology remains part of #48.
- `429 email_change_rate_limited` includes `Retry-After` in seconds. `503 email_change_delivery_failed` retains the pending request (and any name update); current login remains valid, retry resend after cooldown. No durable mail queue or automatic retry is added.
- Confirmation: `401 email_change_token_invalid` for unknown/expired/used/cancelled tokens; `422` for malformed input; `409 user_already_exists` if another account claimed the address. Conflict rolls back everything, including revocation and token consumption. Request/resend can also return `409`; resend without a pending address returns `409 email_change_not_pending`. PATCH retains existing `422 user_already_exists` validation for known conflicts.
- Unique email comparison follows existing exact PostgreSQL text/login semantics. This change does not normalize or merge existing accounts.

## Schema and release

Per project decision, keep `synchronize: true`; no migration is included. TypeORM adds the nullable pending fields, send counter and unique indexes from the User entity. Existing duplicate email addresses must be resolved before startup because the unique index will reject them; no automatic account merging or deletion is performed.

Deploy the same model version to API and worker, since both synchronize the shared schema. Running the old model concurrently can undo schema additions. No worker delivery logic changes are included.

Frontend support belongs to envault_fe#11. Actual delivery, frontend confirmation and production smoke checks remain external release checks; automated tests stub email transport.
