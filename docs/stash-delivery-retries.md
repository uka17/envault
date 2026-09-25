# Stash delivery retries

Only the backend worker is changed (`uka17/envault#46`). The API contract is unchanged:
the retry fields below are internal and are excluded from API responses.

## How delivery works

The worker (`service/StashSenderService.ts`) runs a pass every `runInterval` (1 s).
Each pass processes due stashes one by one. Each stash is handled in its own
transaction that holds a PostgreSQL row lock (`FOR UPDATE SKIP LOCKED`) during the
email submission and the result write.

A stash is selected when all of the following are true:

- `scheduled_at <= now` and `is_sent IS NOT TRUE`;
- `delivery_attempts < maxAttempts`;
- `next_attempt_at IS NULL OR next_attempt_at <= now`.

Outcomes:

| Outcome | What is written | Log |
| --- | --- | --- |
| Provider accepted the email | `SendLog` row, `is_sent = true`, `sent_at` (one transaction) | `info Sent stash <id> to <to> (messageId=...)` after commit |
| Send failed or timed out | `delivery_attempts + 1`, `next_attempt_at`, `last_delivery_error` (committed) | `warn Stash <id> delivery failed (<category>), attempt n/max, next attempt at <time>` |
| Last allowed attempt failed | same, with `next_attempt_at = NULL` | `error Stash <id> delivery attempts exhausted (max/max), last error: <category>. Automatic sending stopped.` |
| Provider accepted, but the DB write or commit failed | nothing (rolled back) | `error Stash <id> was accepted by the email provider (messageId=...) but the delivery was not recorded; ...` |
| Database unavailable | nothing | the error is logged and the pass ends; the next pass starts on the next tick |

A failed send does not end the pass: the stash is moved out of the selection by its
`next_attempt_at`, and the worker continues with the next due stash. A database error
ends the pass, because the next selection would most likely fail as well.

`EmailService` also logs every provider failure with safe fields only:
`Email delivery failed: category=<timeout|send_failed> name=... code=... httpStatus=... awsRequestId=...`.
The provider error message is never logged or stored, because transport errors can
contain the email body, including unlock and authentication links. `awsRequestId`
can be used to look the request up on the AWS side.

## Settings

Worker, `worker/src/config/config.ts` (constants, not ENV):

| Setting | Value | Meaning |
| --- | --- | --- |
| `delivery.maxAttempts` | 8 | Automatic send attempts per stash, including the first one |
| `delivery.baseDelayMs` | 60 000 (1 min) | Delay after the first failure; doubles after each next failure |
| `delivery.maxDelayMs` | 3 600 000 (1 h) | Upper bound of a single delay |

With these values the delays are 1, 2, 4, 8, 16, 32, 60 minutes. Automatic sending
stops about 2 hours after the first failure.

`EmailService`, `api/src/config/config.ts` (shared by the worker and the API flows:
password reset, email verification, email change):

| Setting | Value | Meaning |
| --- | --- | --- |
| `emailTimeout.connectionMs` | 3 000 | SES connection timeout |
| `emailTimeout.requestMs` | 10 000 | SES socket inactivity timeout of one HTTP request |

The timeouts are configured on the SES client HTTP handler, so a hanging request is
actually aborted, not only abandoned. The AWS SDK retries transient errors, including
timeouts, up to its default of 3 attempts. The worst case for one `send` is therefore
about 3 × (3 s + 10 s) plus a short SDK backoff, roughly 40 s. While the worker waits,
the row stays locked and API cancel/snooze of that stash return
`409 stash_delivery_in_progress`.

Changing `maxAttempts` applies to existing rows: raising it makes exhausted stashes
eligible again, lowering it stops stashes that already reached the new limit.

## Guarantees and accepted beta trade-off

- `is_sent`/`sent_at` keep their meaning: the provider accepted the email and the
  result was committed. It does not mean that the email was read or reached the inbox.
- Exactly-once delivery is not guaranteed. A duplicate notification is possible when:
  - the send timed out, but SES had accepted the email (a timeout is an ambiguous
    result and is retried like any other failure, both by the SDK and by the worker);
  - SES accepted the email, but writing `SendLog`/`stash` or the commit failed.
    This case is logged as `... was accepted by the email provider ... but the delivery
    was not recorded`, and the stash is sent again on a later pass.
- The attempt limit and the delays regulate ordinary retries. They do not close the
  gap between the external send and the DB commit.
- A success is never logged for a result that was not committed.

## User actions and retries

- **Snooze** starts a new delivery cycle: it moves `scheduled_at` as before and resets
  `delivery_attempts = 0`, `next_attempt_at = NULL`, `last_delivery_error = NULL`.
  This also applies to a stash that exhausted its attempts. The snooze adds hours to
  the current `scheduled_at`, so if the result is still in the past the stash is sent
  on the next pass.
- **Cancel (delete)** works for any stash, including one with failed or exhausted
  attempts.
- Both actions take the same row lock with `NOWAIT`. While the worker is sending the
  stash (successfully or not), they return `409 stash_delivery_in_progress`. After the
  attempt is recorded the lock is released and they work immediately.

## Finding and resuming exhausted stashes

Find stashes that stopped retrying (use the current `maxAttempts`):

```sql
SELECT id, scheduled_at, delivery_attempts, last_delivery_error, modified_on
FROM stash
WHERE is_sent IS NOT TRUE AND delivery_attempts >= 8
ORDER BY scheduled_at;
```

Then look for `Stash <id> delivery ...` and `Email delivery failed` lines in the worker
logs (Loki) around the attempt times to find the cause.

After the cause is fixed, allow automatic sending for a specific stash. Try it on a
non-production database first:

```sql
UPDATE stash
SET delivery_attempts = 0, next_attempt_at = NULL, last_delivery_error = NULL
WHERE id = <stash_id> AND is_sent IS NOT TRUE;
```

The update must report exactly one row. If `scheduled_at` is in the past, the worker
sends the stash on its next pass. The row lock protects this update from a concurrent
worker pass: while the stash is being sent the update waits until the send is recorded.
The owner can achieve the same by snoozing the stash.

## Schema

The columns are added by TypeORM `synchronize: true`, no migration is needed:

| Column | Type | Default |
| --- | --- | --- |
| `delivery_attempts` | `integer NOT NULL` | `0` |
| `next_attempt_at` | `timestamptz NULL` | `NULL` |
| `last_delivery_error` | `varchar(32) NULL` | `NULL`; `timeout` or `send_failed` |

Existing rows get `0` attempts and no delay, so they are selected as before.
