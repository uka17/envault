# Account password recovery

Only the backend in `uka17/envault` is changed. The reset form and login navigation
belong to `uka17/envault_fe#12`. Recovery does not decrypt, modify or regenerate any
stash, public link or encryption key.

## Contract

Both endpoints are public and return JSON. Tokens and passwords must never be logged.

| Endpoint | Body | Responses |
| --- | --- | --- |
| POST /api/v1/users/password-reset/request | `{email}` | `200 {}` regardless of account existence, verification status or delivery success; `422` invalid email; `429 password_reset_rate_limited`; `500 error_500` on database failure |
| POST /api/v1/users/password-reset/confirm | `{token,newPassword}` | `200 {}`; `400 password_reset_invalid` for missing, malformed, unknown, expired or used token; `422` invalid password; `429 password_reset_rate_limited`; `500 error_500` |

Password validation runs before token lookup. With a valid password, all invalid
kinds of token have the same 400 response. Password rules match the existing change
password flow. Success clears the refresh cookie but does not issue a login token.
All sessions, including refresh tokens inside their rotation grace period, are revoked.

`email` is trimmed and validated; account lookup remains case-sensitive, as in login.
The rate-limit key is SHA-256 of the trimmed, lowercased address, so case variants
share a budget without changing existing account identity rules.

## Tokens, concurrency and delivery

Use 32 cryptographically random bytes encoded as 64 lowercase hex characters.
Store only SHA-256 and a 30-minute expiry, bound to the current verified email.
A request that passes rate limits replaces the previous token. A throttled request
leaves the current link intact. Open the link at `BASE_URL/reset-password?token=...`.
`BASE_URL` is the existing frontend origin configuration; production must use HTTPS.

Requests serialize address budgets, then lock the user row. Confirmation and normal
password changes lock the user row, update the password, clear the reset fields and
revoke sessions within one transaction. Login locks the same row and checks the
password hash and email against the snapshot used for authentication before creating
its session. Registration verification updates only emailVerifiedAt, never a stale
password or reset-token snapshot. Confirmed email changes invalidate reset links.

Send email only after the database commit. A failed send still consumes the request
budget and the new token replaces the previous one; the user may request another
link within the remaining budget. No retries/outbox are introduced. Delivery errors
are logged as fixed messages without transport error objects or email bodies.
Concurrent emails can arrive out of order: only the last committed link is valid.

## Limits and schema

Defaults live in `api/src/config/config.ts`, under `passwordReset`:

- Request: 3 attempts / 15 minutes / normalized email (PostgreSQL).
- Request: 20 attempts / 15 minutes / socket IP (process memory).
- Confirmation: 30 attempts / 15 minutes / socket IP (separate process memory budget).
- Each 429 has `password_reset_rate_limited` and `Retry-After` in seconds.

The persistent address budget includes unknown and unverified accounts and delivery
failures. It survives app restarts and serializes concurrent requests. Inactive entries
older than one day are deleted during subsequent requests. No raw addresses are
stored in the budget table. IP budgets reset on restart and are per process; the current
single-API-instance deployment is the supported configuration until #48 supplies shared
limits/proxy integration. Do not enable unconditional trust proxy. Currently Express
uses the socket peer, so clients cannot bypass these limits through X-Forwarded-For,
but clients behind nginx share its IP budget. Production integration behind nginx
remains blocked on #48's explicit trusted proxy topology and verification.

Schema: three nullable, serialization-excluded User fields (`passwordResetTokenHash`,
`passwordResetExpiresAt`, `passwordResetEmail`), a unique nullable token-hash index,
and `PasswordResetLimit` with a hashed-address primary key, window timestamp/index,
and request count. Per the issue and user instruction, no migrations are added;
`synchronize: true` stays enabled. Deploy the same entity version to API and worker.

## Integration and validation

#47 session checks are already on master. This work starts from master while #67
(email change) is still open. When integrating #67, retain the password-snapshot
check in createRefreshToken and clear all three passwordReset fields in the email
confirmation transaction. Email binding already rejects a reset link after the
address changes; explicit clearing also prevents revival if an address changes back.
Re-run the password-reset and email-change suites after resolving overlapping edits.
Do not merge #52 without that cross-flow check if #67 lands first.

Run build/lint and both API and worker suites against separate clean PostgreSQL test
databases. Tests stub email delivery; no real messages or production data are needed.
Cover neutral responses, durable limits, fake-clock expiry/window reset, concurrent
requests and confirmation, transaction rollback, stale login, password/email updates,
session revocation, stash immutability and template/log secrecy.

Frontend integration, actual SES delivery and production smoke are separate checks;
local/CI unit and integration tests do not claim those checks passed.
