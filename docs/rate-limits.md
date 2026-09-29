# Rate limits

Every limit answers 429 with `Retry-After` in seconds. Limits added in #48 use the code
`rate_limited`; older ones keep their own codes. Budgets live in `api/src/config/config.ts`
(`rateLimits` and the older per-feature settings).

## Limits

| Endpoint | Key | Budget | Storage | 429 code |
|---|---|---|---|---|
| `POST /api/v1/users/login` | IP | 20 / 15 min | memory | `rate_limited` |
| `POST /api/v1/users/login` | account (address hash) | 10 / 15 min | PostgreSQL | `rate_limited` |
| `POST /api/v1/users` | IP | 10 / hour | memory | `rate_limited` |
| `POST /api/v1/users/verify-email/resend` | address hash | 3 / 15 min | PostgreSQL | `rate_limited` |
| `POST /api/v1/stashes` | user ID | 20 / 24 hours | PostgreSQL | `rate_limited` |
| `GET /api/public/stashes/:token` | IP | 30 / 15 min | memory | none (default body) |
| `POST /api/v1/users/verify-email`, `/verify-email/resend`, `/email-change/confirm` | IP, one budget for all three | 100 / 15 min | memory | none (default body) |
| `POST /api/v1/users/password-reset/request` | IP | 20 / 15 min | memory | `password_reset_rate_limited` |
| `POST /api/v1/users/password-reset/request` | address hash | 3 / 15 min | PostgreSQL (`password_reset_limit`) | `password_reset_rate_limited` |
| `POST /api/v1/users/password-reset/confirm` | IP | 30 / 15 min | memory | `password_reset_rate_limited` |
| `POST /api/v1/users/email-change/request`, `/email-change/resend` | user ID | 60 s cooldown, 3 sends / 15 min | PostgreSQL (`user` columns) | `email_change_rate_limited` |

Order within a route matters:

- Login: the IP limit runs before validation, so malformed requests count. The account limit runs
  before the password check, so the answer is the same for existing and unknown accounts.
- Registration: the IP limit runs before validation, because validation reports
  `user_already_exists`; a limit after it would leave address probing unlimited.
- Resend and stash creation: the limit runs after validation, which reveals nothing, so rejected
  requests do not use the budget.

Account keys are SHA-256 hashes of the trimmed, lower-cased address
(`RateLimitService.emailKey`), so case variants share one budget and addresses are not stored.

## Storage

- **Memory** (`ipRateLimit`, `express-rate-limit`): per process, reset on restart. Used for IP
  limits, where a reset after a deploy is acceptable.
- **PostgreSQL** (`persistentRateLimit`, `RateLimitService`, table `rate_limit_counter`): fixed
  windows updated by one atomic upsert, so budgets survive restarts, concurrent requests never
  exceed them, and several API processes would share them. Expired windows of a bucket are deleted
  on the next request to that bucket.

**The API runs as a single replica.** `docker-compose.yml` sets `container_name: envault-api`,
which prevents scaling the service. With several replicas every in-memory limit would be
multiplied by the replica count; before scaling, switch those limits to `persistentRateLimit`.

## Request size

- JSON bodies are limited to `jsonBodyLimit` (256 KB). Larger requests get 413
  `payload_too_large`.
- The encrypted stash `body` must be a string (422 `should_be_string`) of at most
  `stashMaxBodyLength` (200 000) characters (422 `stash_body_too_long`). This fits into the JSON
  limit together with the other fields. The body is base64 ciphertext, so it holds about 150 KB of
  UTF-8 plaintext.

## Client IP behind Cloudflare and nginx

Production topology:

```
Browser -> Cloudflare edge -> envault-nginx (${WEB_HOST}) -> envault-api:9000
```

Each hop only sees the TCP peer in front of it, so the client address has to be passed along
explicitly, and every hop must trust only the hop directly in front of it:

- nginx sees Cloudflare edge addresses. It restores the client address from `CF-Connecting-IP`
  with the `real_ip` module, accepting that header only from Cloudflare ranges
  (`set_real_ip_from`, see https://www.cloudflare.com/ips/). A request which reaches the server
  directly, bypassing Cloudflare, keeps its real peer address, so a forged `CF-Connecting-IP`
  is ignored.
- nginx overwrites `X-Forwarded-For` with that restored `$remote_addr` instead of appending to
  the value sent by the client.
- The API sees only nginx and reads the client address from `X-Forwarded-For`.

Without the nginx part `$remote_addr` is a Cloudflare edge address: one client is spread across
many edges and many clients share one edge, so IP-based limits are not effective. The nginx
configuration lives in `envault_fe/nginx.conf`.

The API trusts only an explicit list of proxies, set in `TRUST_PROXY`:

- `TRUST_PROXY` is a comma-separated list of IP addresses, CIDR subnets or `loopback`.
  In production set it to the nginx container address (the `WEB_HOST` value of `envault_fe`).
- Express walks `X-Forwarded-For` from right to left, skipping trusted proxies, and uses the first
  untrusted address as `req.ip`. Anything the client put to the left of it is ignored.
- `TRUST_PROXY` is required when `ENV=PROD`, and the API refuses to start without it. Values that
  trust everyone (`true`, hop counts, `0.0.0.0/0`, `::/0`) are rejected.
- Without `TRUST_PROXY` (local development) `X-Forwarded-For` is ignored and `req.ip` is the
  socket peer.

Example: a client sends `X-Forwarded-For: 1.2.3.4`, and an nginx which appends instead of
overwriting would forward `1.2.3.4, 203.0.113.7`. With `TRUST_PROXY=<nginx address>` the API
still uses `203.0.113.7`. With `trust proxy = true` it would use the spoofed `1.2.3.4`, so
rotating that value would bypass every IP limit.
