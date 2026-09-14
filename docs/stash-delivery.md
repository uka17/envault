# Stash delivery contract (#45)

| State | Snooze | Delete |
| --- | --- | --- |
| Unsent, unclaimed | Add 1–8760 hours to scheduledAt | Cancel and delete |
| Unsent, claimed (fresh or stale) | 409 stash_delivery_in_progress | 409 stash_delivery_in_progress |
| Sent | 409 stash_already_sent | Delete content and SendLog, revoke link |
| Missing or foreign owner | 404 stash_not_found | 404 stash_not_found |

The owner predicate is part of the locked lookup and mutation. A concurrent row
mutation also returns 409 stash_delivery_in_progress (NOWAIT); the caller can
reload and retry. Deleting a delivered message cannot recall its email. Public
reading before scheduledAt remains allowed. Invalid IDs (outside 1–2147483647)
return 422 stash_id_invalid; invalid hours return 422 snooze_hours_invalid.
Creation requires a valid future ISO 8601 date (date_format_incorrect or
scheduled_at_must_be_future). Each hour is exactly 3600000 milliseconds, added to
the existing schedule. A result still in the past remains eligible for delivery.

Claim selection and snapshot loading share one transaction. Each claim receives
a random UUID claim_token. Delivery verifies that token with FOR UPDATE SKIP
LOCKED and holds the row lock during transport submission, SendLog insertion,
and the final update. An active sender cannot be reclaimed even when locked_at
is old. A reclaimed snapshot cannot send, mark sent, or release a new owner's
claim. API mutations lock the same row. The token is excluded from API responses.

This uses one database connection per active delivery. Size the worker batch and
connection pool accordingly. A process or connection failure after SES accepts
an email but before commit can still cause a retry and duplicate email: PostgreSQL
and SES do not share a transaction. This change does not promise exactly-once
email delivery. Non-PROD recipient redirection remains unchanged.

## Schema and rollout

The application is still pre-production and uses TypeORM `synchronize: true`.
The nullable UUID field `Stash.claimToken` maps to `stash.claim_token`; TypeORM
synchronizes the column from the entity definition. No migration or new
environment variable is required. Deletion removes SendLog rows explicitly in
the same transaction.

Stop and drain old workers before deploying the new API and workers. Old workers
do not enforce claim tokens; mixed versions do not provide this contract. Old
outstanding claims have a null token and are recovered only after their stale
timeout by a new worker.

Tests run on separate, disposable PostgreSQL databases with email transport
stubbed. They cover both mutation/claim orders, two concurrent claims, stale
fencing, active delivery exclusion using promise barriers, API conflicts and
validation, DST duration, delivery-log deletion, missing claim tokens, ambiguous
delivery failures, and the ORM-created column and token serialization.
