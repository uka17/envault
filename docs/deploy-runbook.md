# Backend deploy runbook

How the backend (`api` and `worker`) is released, how to tell that a release is healthy, and
what to do when it is not (`uka17/envault#51`).

Paths are relative to the repository root. On the server the repository lives in
`/home/ubuntu/envault`.

## Pipeline

Pull requests and pushes to `master` have separate workflows in `.github/workflows/`. A pull
request runs only what is needed to accept the change, a push runs the same checks and then
releases.

| Workflow | Runs on | Jobs |
| --- | --- | --- |
| `pr.yml` | PR | `lint`, `tests` |
| `pr-docker.yml` | PR that touches `Dockerfiles/`, `package.json`, `package-lock.json` or `tsconfig.json` | `docker_build` |
| `release.yml` | push | `lint`, `tests`, `publish`, `deploy` |

| Job | What it does |
| --- | --- |
| `lint` | `npm ci`, `npm run lint` |
| `tests` | Calls `tests.yml`: for `api` and `worker` builds the project, runs the Mocha tests once with coverage on a fresh PostgreSQL and uploads the report to Codecov |
| `docker_build` | Builds both images without pushing them |
| `publish` | Builds both images and pushes them tagged with the commit SHA |
| `deploy` | Checks out the commit on the server and runs `scripts/deploy.sh <sha>` |

`publish` needs `lint` and `tests`, and `deploy` needs `publish`, so a failing lint, build or
test blocks image publishing and the deploy. The build has no job of its own: `tests` compiles
the project before running. Coverage thresholds are enforced by Codecov only (`codecov.yml`).
Images are immutable: there is no `latest` tag, a version is always a full commit SHA.

A push to `master` deploys to production automatically. A running deploy is never cancelled
by a newer push to `master`: the newer run waits until it finishes.

## Health signals

| Signal | Where | Meaning |
| --- | --- | --- |
| Runtime config validation | start of both processes | Missing or invalid settings stop the process with exit code 1. Only variable names are printed. In `ENV=PROD` `BASE_URL` must be `https://`. |
| Fail-fast start | start of both processes | A database connection or schema synchronization error stops the process with exit code 1 (`common/startup.ts`). |
| `GET /health` | api | Liveness only: 200 while the process runs, even without the database. |
| `GET /ready` | api | Readiness: runs `SELECT 1` with a 3 s timeout. 200 `{"status":"ok","version":"<sha>"}` or 503 `{"status":"unavailable",...}`. |
| Heartbeat | worker | `/tmp/envault-worker-heartbeat` inside the container holds the time of the last completed database round trip of the delivery loop. `node dist/worker/src/healthcheck.js` exits with 1 when it is older than 2 minutes or missing. |

`docker-compose.yml` uses `/ready` and the heartbeat as container health checks. A worker
which is stopped, stuck in a pass or cut off from the database turns `unhealthy`.

`/ready` is not exposed through nginx (only `/api/` is proxied). Check it on the server:

```bash
docker exec envault-api curl -s http://127.0.0.1:9000/ready
docker ps --filter name=envault-
```

Docker does not restart a container because it is `unhealthy`. After a deploy the status is
only a signal for the operator, see `uka17/envault#78`.

## How a deploy works

`scripts/deploy.sh <sha>` on the server:

1. Requires the repository to be checked out at `<sha>`, so `docker-compose.yml` and the
   script belong to the deployed version.
2. Finds the previous version: `.deploy/current`, or on the first run the commit of the
   running `envault-api` container.
3. Pulls both images of `<sha>` before touching any container.
4. Starts the version with `docker compose up --wait` and waits up to 180 s
   (`DEPLOY_WAIT_TIMEOUT`) for all containers to become healthy.
5. Checks that both containers run `<sha>`.
6. On failure decides about a rollback, see below.

State on the server, in `.deploy/` (not in git):

| File | Content |
| --- | --- |
| `current` | Commit of the last version which passed the health checks. This is the rollback target. |
| `previous` | Commit which was `current` before it. |
| `history.log` | One line per deploy: time, result, requested and previous commit, commits running in `api` and `worker` after the deploy. |

Results in `history.log`:

| Result | Exit code | State after the deploy |
| --- | --- | --- |
| `DEPLOYED` | 0 | The requested version is running and healthy. |
| `FAILED_NO_IMAGE` | 1 | Images could not be pulled. Nothing was changed. |
| `FAILED_ROLLED_BACK` | 1 | The requested version did not become healthy, the previous version is running and healthy again. |
| `FAILED_NO_ROLLBACK` | 1 | The requested version did not become healthy and was left in place, because a rollback was not allowed. |
| `FAILED_ROLLBACK_FAILED` | 1 | Neither the requested nor the previous version became healthy. |

Application logs are not printed by the script, because they contain recipient addresses and
the output ends up in the CI log. Read them on the server with `docker logs envault-api` and
`docker logs envault-worker`.

## Rollback rules and limits

A rollback of images is not a rollback of the schema or the data. There are no migrations:
TypeORM `synchronize: true` alters the schema when a version starts. The previous version
also runs `synchronize` when it starts, and would try to change the schema back, which can
drop columns and their data.

Therefore the previous version is started automatically only when the schema is confirmed
to be the same: there is no difference between the two commits in `model/`,
`common/dataSource.ts` and `common/SnakeNamingStrategy.ts`. With any difference the result is
`FAILED_NO_ROLLBACK`: the failed version stays, and the recovery is a manual decision.

There is also no rollback when no previous version is known, when the failed version is the
previous version itself, or when the previous commit is not in the repository on the server.

## Before a release which changes the schema

A release changes the schema when it touches `model/`, `common/dataSource.ts` or
`common/SnakeNamingStrategy.ts`. Before merging it:

1. Take a database backup on the server:

   ```bash
   docker exec envault-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
     > ~/envault-backup-$(date -u +%Y%m%dT%H%M%SZ).dump
   ```

2. Check that the file is not empty and keep it outside the repository directory.
3. Remember that an automatic rollback will not happen for this release.

The backup is a manual step. Taking it automatically is `uka17/envault#76`, scheduled
backups and a verified restore are `uka17/envault#50`.

## Manual operations

`docker compose` needs `IMAGE_TAG` for every command, including read-only ones:

```bash
cd /home/ubuntu/envault
IMAGE_TAG=$(cat .deploy/current) docker compose ps
```

Status of the last deploys and of the running versions:

```bash
tail -n 5 .deploy/history.log
docker ps --filter name=envault-
```

Deploy a specific published version by hand (also the way to return to an older version
when the schema is the same):

```bash
cd /home/ubuntu/envault
git fetch origin master
git checkout --detach <sha>
./scripts/deploy.sh <sha>
```

The repository on the server stays in detached HEAD at the deployed commit. This is expected.

## Recovery

### `FAILED_ROLLED_BACK`

The service works on the previous version. Find the reason in the CI log of the `deploy`
job (container states at the moment of the failure), fix it in a new commit.

### `FAILED_NO_IMAGE`

The service works on the previous version. Check the `publish` job and Docker Hub.

### `FAILED_NO_ROLLBACK` and `FAILED_ROLLBACK_FAILED`

The service may be down. On the server:

1. Look at the state and the logs:

   ```bash
   docker ps --all --filter name=envault-
   docker logs --tail 100 envault-api
   docker logs --tail 100 envault-worker
   ```

2. If the reason is outside the release (database down, wrong `.env`, no disk space), fix it
   and deploy the same version again by hand.
3. If the release is broken and the schema did not change, deploy the previous version by
   hand: `cat .deploy/current` names the last healthy version.
4. If the release is broken and the schema changed, prefer a fix in a new commit (roll
   forward). Starting the previous version makes `synchronize` change the schema back and
   can drop the data of new columns.
5. Restoring the database from a backup is the last resort and a separate manual operation.
   All records created after the backup are lost: accounts, stashes, delivery state, and a
   stash sent after the backup may be sent again. Stop both processes first:

   ```bash
   docker stop envault-api envault-worker
   docker exec -i envault-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
     < ~/envault-backup-<time>.dump
   ```

   Then deploy by hand the version which matches the restored schema.

## Deploy drill

`scripts/deploy-drill.sh` checks `scripts/deploy.sh` on a developer machine, without a server
and without pushing anything. It builds real images of the working tree, derives broken
versions from them and runs five scenarios against a throwaway compose project with its own
database: a first deploy, a failed start with a rollback, a next good version, a commit
without images, and a stuck worker with a schema change (no rollback).

```bash
./scripts/deploy-drill.sh
```

It refuses to run when `envault-api`, `envault-worker`, `envault-postgres` or
`envault_network` already exist on the machine. Run it after every change of
`scripts/deploy.sh`, of the health checks or of `docker-compose.yml`. There is no separate
test environment, the drill replaces it.

## Checks after a production deploy

### Deploy

- The `deploy` job is green.
- The last line of `.deploy/history.log` is `DEPLOYED` and names the merged commit for `api` and `worker`.
- `docker ps` shows `envault-api` and `envault-worker` as `(healthy)`.

### HTTPS

```bash
curl -sI http://envault.me | head -n 1              # 301
curl -sI http://envault.me | grep -i '^location'    # https://envault.me/
curl -sI https://envault.me | head -n 1             # 200
echo | openssl s_client -connect envault.me:443 -servername envault.me 2>/dev/null \
  | openssl x509 -noout -subject -enddate           # CN = envault.me, not expired
```

`BASE_URL` on the server must be `https://envault.me`. The processes refuse to start in
`ENV=PROD` with a `BASE_URL` which is not `https://`.

### Mail delivery and URLs in emails (SES smoke)

Real recipients are used only when `ENV=PROD`. Run the smoke with addresses you control and
never with addresses of real users. If the SES account is still in the sandbox, only
verified addresses receive mail.

1. Registration confirmation. Register a new account at `https://envault.me` with a
   controlled address. Expected: an email from `noreply@envault.me` arrives, its link starts
   with `https://envault.me/verify-email?code=`, opening it verifies the account.
2. Scheduled stash. From that account create a stash for a controlled recipient with the
   nearest allowed delivery time. Expected: after that time an email arrives, its link
   starts with `https://envault.me/unlock/`, the message opens and decrypts with the key.
3. On the server confirm the delivery in the worker log:
   `docker logs envault-worker | grep "Sent stash"`.

Record the date, the deployed commit and the SES `messageId` values in the table below.
Do not mark a check as done without such evidence.

## Verification status

| Check | Status | Evidence |
| --- | --- | --- |
| Fail-fast start of api and worker on a database error | Done, 2026-10-01 | Local run with an unreachable database: both exit with code 1 |
| `/ready` reflects a database failure | Done, 2026-10-01 | Mocha tests; local run: 503 after 3 s with PostgreSQL stopped, 200 after it is back, `/health` stays 200 |
| Stopped or stuck worker is detected | Done, 2026-10-01 | Mocha tests; local run: health check exits with 1 after 121 s with PostgreSQL stopped |
| Unhealthy version makes the deploy red, compatible previous version returns | Done, 2026-10-01 | `scripts/deploy-drill.sh`, all five scenarios passed locally |
| Backup and restore commands | Partly, 2026-10-01 | Command form checked on a local PostgreSQL 16 test database. Not run against production (PostgreSQL 18) |
| HTTPS redirect and certificate | Done, 2026-10-01 | `http://envault.me` answers 301 to `https://envault.me/`, `https://envault.me` answers 200, certificate `CN = envault.me` valid until 2026-11-04 |
| Failing lint, build or test blocks image publishing | Done, 2026-10-01 | Throwaway pull requests with one intentional failure each, closed without merge. The image build job was skipped in every run: lint [#79](https://github.com/uka17/envault/actions/runs/36917251778), build [#80](https://github.com/uka17/envault/actions/runs/36917259518), tests [#81](https://github.com/uka17/envault/actions/runs/36917262042). Checked on pull requests in the former single workflow `deploy.yml`; `publish` in `release.yml` needs `lint` and `tests` the same way |
| `deploy` job on GitHub with the real server | Not done | Runs for the first time when this change is merged to `master` |
| SES smoke: registration confirmation | Not done | |
| SES smoke: scheduled stash | Not done | |
| URLs in production emails use `https://envault.me` | Not done | Part of the SES smoke |
| Restore of the production database from a backup | Not done | `uka17/envault#50` |

## Known limits

- The first deploy with this mechanism replaces a version which has neither `/ready` nor
  container health checks. A rollback to it only checks that its containers run the expected
  commit, not that they are ready.
- `master` has no branch protection, so the checks are not enforced for a merge. Postponed
  until the end of the beta.
- The `deploy` job has no manual approval (`environment: PROD` is commented out in the workflow).
- An unhealthy container is not restarted and nobody is notified, see `uka17/envault#78`.
