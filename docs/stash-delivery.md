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

## Migration and rollout

The additive TypeORM migration
`common/migrations/1789420000000-StashClaimToken.ts` adds nullable UUID
`stash.claim_token`; it is registered in the DataSource. Existing content and
SendLog constraints are unchanged. Deletion removes SendLog rows explicitly in
the same transaction, so no FK migration is needed.

Production rollout remains dependent on #44, which must provide the versioned
migration baseline/runner and disable production synchronize. The current
DataSource still uses the pre-existing synchronize setting; do not treat local
schema synchronization as a production migration check. Integrate this migration
with #44 before deployment or closing #45. Do not run its up method after
synchronize has already added the column.

Stop and drain old workers before applying the migration and deploying the new
API and workers. Old workers do not enforce claim tokens; mixed versions do not
provide this contract. Old outstanding claims have a null token and are recovered
only after their stale timeout by a new worker. Rollback requires stopping new
workers before reverting code and dropping claim_token. No new environment
variables are required.

Tests run on separate, disposable PostgreSQL databases with email transport
stubbed. They cover both mutation/claim orders, two concurrent claims, stale
fencing, active delivery exclusion using promise barriers, API conflicts and
validation, DST duration, delivery-log deletion, and migration down/up in a
rolled-back transaction. Production smoke tests and migration integration with
#44 require a separate deployment validation.
