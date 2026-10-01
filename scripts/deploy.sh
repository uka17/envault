#!/usr/bin/env bash
# Health-gated rollout of the backend (api and worker) to the images of one commit.
#
# Usage: scripts/deploy.sh <commit sha>
#
# The repository must already be checked out at <commit sha>, so docker-compose.yml and this
# script belong to the deployed version. The script starts the images tagged with the commit,
# waits for the container health checks and verifies the running versions.
#
# On a failed rollout the previous version is started again, but only when the database schema
# did not change between the two versions. The schema is altered by TypeORM synchronize on
# start, so a rollback of images is never a rollback of the schema or the data. With a schema
# change the failed version is left as is and the recovery is manual.
#
# State is kept in .deploy/:
#   current      commit of the last version which passed the health checks, the rollback target
#   previous     commit which was current before it
#   history.log  one line per deploy with its result and the running versions
#
# Exit code is 0 only when the requested version is running and healthy.

set -euo pipefail

readonly API_IMAGE="uka17/envault-api"
readonly WORKER_IMAGE="uka17/envault-worker"
readonly API_CONTAINER="envault-api"
readonly WORKER_CONTAINER="envault-worker"
readonly STATE_DIR=".deploy"
# Seconds to wait for all containers to become healthy.
readonly WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-180}"
# Files which define the database schema. A difference in them between two versions means
# the previous version is not confirmed to work with the schema of the new one.
readonly SCHEMA_PATHS=(model common/dataSource.ts common/SnakeNamingStrategy.ts)

# Prints a message with a UTC timestamp.
# $@ - message
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

# Prints the commit a running container was built from, or nothing when there is no such
# container. Only the GIT_COMMIT_SHA variable is read, other variables hold secrets.
# $1 - container name
running_version() {
  { docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2> /dev/null || true; } \
    | sed -n 's/^GIT_COMMIT_SHA=//p'
}

# Prints the commit to roll back to: the last version which passed the health checks, or,
# on the first run of this script, the version of the running api container.
previous_version() {
  if [[ -s "$STATE_DIR/current" ]]; then
    cat "$STATE_DIR/current"
  else
    running_version "$API_CONTAINER"
  fi
}

# Appends the result of a deploy with the versions which are running now to the history.
# $1 - result, $2 - requested commit, $3 - previous commit
record() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 target=$2 previous=${3:-none}"
  line+=" api=$(running_version "$API_CONTAINER") worker=$(running_version "$WORKER_CONTAINER")"
  echo "$line" >> "$STATE_DIR/history.log"
  log "Recorded: $line"
}

# Makes sure an image is available before any container is touched.
# $1 - image with tag
# Returns non-zero when the image is neither present nor can be pulled.
ensure_image() {
  docker image inspect "$1" > /dev/null 2>&1 || docker pull --quiet "$1"
}

# Starts the containers of one version, waits until all of them are healthy and checks that
# both processes run the expected commit.
# $1 - commit to start
# Returns non-zero when a container is unhealthy, keeps restarting or runs another version.
start_version() {
  local sha="$1" api worker
  IMAGE_TAG="$sha" docker compose up --detach --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" \
    || return 1
  api="$(running_version "$API_CONTAINER")"
  worker="$(running_version "$WORKER_CONTAINER")"
  if [[ "$api" != "$sha" || "$worker" != "$sha" ]]; then
    log "Running versions do not match $sha: api=${api:-none} worker=${worker:-none}"
    return 1
  fi
}

# Prints the state of the backend containers. Application logs are not printed, as they
# may contain recipient addresses and this output ends up in the CI log.
show_containers() {
  docker ps --all --filter "name=envault-" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
}

# Decides whether the previous version may be started automatically after a failed rollout.
# $1 - previous commit, $2 - failed commit
# Returns non-zero, with the reason printed, when an automatic rollback is not allowed.
rollback_allowed() {
  local previous="$1" target="$2" status=0
  if [[ -z "$previous" ]]; then
    log "No previous version is known, nothing to roll back to."
    return 1
  fi
  if [[ "$previous" == "$target" ]]; then
    log "The failed version is the previous version itself, nothing to roll back to."
    return 1
  fi
  if ! git cat-file -e "$previous^{commit}" 2> /dev/null; then
    log "Commit $previous is not in this repository, schema compatibility cannot be checked."
    return 1
  fi
  git diff --quiet "$previous" "$target" -- "${SCHEMA_PATHS[@]}" || status=$?
  if [[ "$status" -ne 0 ]]; then
    log "The database schema differs between $previous and $target."
    log "The previous version is not confirmed to work with the current schema, no automatic rollback."
    return 1
  fi
}

# Starts the previous version again, using docker-compose.yml of that version.
# $1 - previous commit
# Returns non-zero when the previous version does not become healthy either.
rollback() {
  local previous="$1"
  log "Rolling back to $previous"
  git checkout --quiet --detach "$previous" || return 1
  start_version "$previous"
}

# Deploys the requested commit and rolls back on failure.
# $1 - commit to deploy
main() {
  if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Usage: $0 <full commit sha>" >&2
    exit 2
  fi
  local target="$1" previous

  cd "$(dirname "$0")/.."
  if [[ "$(git rev-parse HEAD)" != "$target" ]]; then
    echo "The repository is not checked out at $target, check it out before deploying." >&2
    exit 2
  fi

  mkdir -p "$STATE_DIR"
  previous="$(previous_version)"
  log "Deploying $target (previous: ${previous:-none})"

  if ! ensure_image "$API_IMAGE:$target" || ! ensure_image "$WORKER_IMAGE:$target"; then
    log "Images of $target are not available. Nothing was changed, the previous version keeps running."
    record "FAILED_NO_IMAGE" "$target" "$previous"
    exit 1
  fi

  if start_version "$target"; then
    if [[ -n "$previous" && "$previous" != "$target" ]]; then
      echo "$previous" > "$STATE_DIR/previous"
    fi
    echo "$target" > "$STATE_DIR/current"
    record "DEPLOYED" "$target" "$previous"
    exit 0
  fi

  log "Version $target did not become healthy."
  show_containers
  if ! rollback_allowed "$previous" "$target"; then
    record "FAILED_NO_ROLLBACK" "$target" "$previous"
    log "Deploy failed, the failed version is left in place. Recover manually."
    exit 1
  fi
  if rollback "$previous"; then
    record "FAILED_ROLLED_BACK" "$target" "$previous"
    log "Deploy failed, the previous version $previous is running again."
  else
    show_containers
    record "FAILED_ROLLBACK_FAILED" "$target" "$previous"
    log "Deploy failed and the rollback to $previous failed too. Recover manually."
  fi
  exit 1
}

# The whole file is parsed before main runs and the script exits right after it, so a
# git checkout which replaces this file during a rollback cannot change the running script.
main "$@"; exit
