#!/usr/bin/env bash
# Reproducible check of scripts/deploy.sh on this machine, without a server and without a registry.
#
# Usage: scripts/deploy-drill.sh
#
# Copies the working tree into a temporary clone, builds real images of it (version A) and
# derives broken and good versions from them. Then runs scripts/deploy.sh against a throwaway
# compose project with its own database and checks the outcome of every scenario:
#
#   1. first deploy of a good version               -> deployed
#   2. api exits on start, schema unchanged         -> red, rolled back to the previous version
#   3. next good version                            -> deployed
#   4. commit without published images              -> red, nothing changed
#   5. worker makes no progress, schema changed     -> red, no automatic rollback
#
# Nothing is pushed and no email can be sent: ENV=DEV and there are no AWS credentials.
# Requires that no envault containers or envault_network exist on this machine.

set -euo pipefail

readonly ROOT="$(cd "$(dirname "$0")/.." && pwd)"
readonly API_IMAGE="uka17/envault-api"
readonly WORKER_IMAGE="uka17/envault-worker"
readonly ALIVE_WITHOUT_WORK='["node", "-e", "setInterval(() => {}, 1000)"]'
readonly EXIT_ON_START='["node", "-e", "process.exit(1)"]'

WORK=""
REPO=""
VERSIONS=()
FAILURES=0

# Prints a step title.
# $@ - title
step() {
  echo
  echo "=== $*"
}

# Compares an actual value with the expected one and counts a mismatch as a failure.
# $1 - what is checked, $2 - actual value, $3 - expected value
expect() {
  if [[ "$2" == "$3" ]]; then
    echo "  ok: $1"
  else
    echo "  FAIL: $1 (expected '$3', got '$2')"
    FAILURES=$((FAILURES + 1))
  fi
}

# Prints the commit a running container was built from.
# $1 - container name
running_version() {
  { docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2> /dev/null || true; } \
    | sed -n 's/^GIT_COMMIT_SHA=//p'
}

# Prints the health status of a container.
# $1 - container name
health() {
  docker inspect --format '{{.State.Health.Status}}' "$1" 2> /dev/null || true
}

# Prints the result recorded by the last deploy.
last_result() {
  tail -n 1 "$REPO/.deploy/history.log" | cut -d ' ' -f 2
}

# Creates a commit in the clone and prints its hash.
# $1 - commit message, $2 - optional file to change, relative to the clone
commit_version() {
  if [[ -n "${2:-}" ]]; then
    echo "// deploy drill" >> "$REPO/$2"
    git -C "$REPO" add "$2"
  fi
  git -C "$REPO" -c user.name=drill -c user.email=drill@localhost commit --quiet --allow-empty -m "$1"
  git -C "$REPO" rev-parse HEAD
}

# Builds an image of a version from the image of another one, optionally replacing its command.
# $1 - image name, $2 - commit of the base version, $3 - commit of the new version,
# $4 - optional command as a JSON array
derive_image() {
  {
    echo "FROM $1:$2"
    echo "ENV GIT_COMMIT_SHA=$3"
    if [[ -n "${4:-}" ]]; then
      echo "CMD $4"
    fi
  } | docker build --quiet --tag "$1:$3" - > /dev/null
}

# Checks out a version in the clone and deploys it, printing the exit code of the deploy.
# $1 - commit to deploy
deploy() {
  local code=0
  git -C "$REPO" checkout --quiet --detach "$1"
  "$REPO/scripts/deploy.sh" "$1" >&2 || code=$?
  echo "$code"
}

# Removes the containers, the database volume, the images and the clone of the drill.
cleanup() {
  step "Cleaning up"
  if [[ -n "$REPO" ]]; then
    IMAGE_TAG=drill docker compose down --volumes --remove-orphans > /dev/null 2>&1 || true
  fi
  for version in "${VERSIONS[@]}"; do
    docker rmi --force "$API_IMAGE:$version" "$WORKER_IMAGE:$version" > /dev/null 2>&1 || true
  done
  if [[ -n "$WORK" ]]; then
    rm -rf "$WORK"
  fi
}

# Runs all scenarios and exits with a non-zero code when any expectation is not met.
main() {
  if docker ps --all --format '{{.Names}}' | grep -Eq '^envault-(api|worker|postgres)$' \
    || docker network inspect envault_network > /dev/null 2>&1; then
    echo "envault containers or envault_network already exist here, the drill would replace them." >&2
    exit 2
  fi

  WORK="$(mktemp -d)"
  REPO="$WORK/repo"
  trap cleanup EXIT

  step "Preparing a clone of the working tree"
  git clone --quiet "$ROOT" "$REPO"
  (cd "$ROOT" && git ls-files -z --cached --others --exclude-standard) | while IFS= read -r -d '' file; do
    if [[ -f "$ROOT/$file" ]]; then
      mkdir -p "$REPO/$(dirname "$file")"
      cp -p "$ROOT/$file" "$REPO/$file"
    fi
  done
  git -C "$REPO" add --all

  cat > "$WORK/drill.env" <<'EOF'
DB_USER=drill
DB_PASSWORD=drill-only
DB_NAME=envault_drill
DB_HOST=172.31.251.10
DB_PORT=5432
API_HOST=172.31.251.20
WORKER_HOST=172.31.251.30
SUBNET=172.31.251.0/24
API_JWT_SECRET=drill-only
ENV=DEV
SHOW_LOGS=FALSE
LOG_LEVEL=INFO
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
BASE_URL=
TRUST_PROXY=
LOKI_HOST=
LOKI_USER=
LOKI_API_KEY=
EOF
  # The database of the drill is not published on the host.
  printf 'services:\n  postgres:\n    ports: !override []\n' > "$WORK/override.yml"
  export COMPOSE_PROJECT_NAME="envault-drill"
  export COMPOSE_FILE="$REPO/docker-compose.yml:$WORK/override.yml"
  export COMPOSE_ENV_FILES="$WORK/drill.env"
  export DEPLOY_WAIT_TIMEOUT=90

  local good crashing next unpublished stuck code
  good="$(commit_version "Drill: good version")"
  crashing="$(commit_version "Drill: api exits on start")"
  next="$(commit_version "Drill: next good version")"
  unpublished="$(commit_version "Drill: version without images")"
  stuck="$(commit_version "Drill: worker makes no progress, schema changed" model/Stash.ts)"
  VERSIONS=("$good" "$crashing" "$next" "$stuck")

  step "Building images (a real build of the working tree, then derived versions)"
  git -C "$REPO" checkout --quiet --detach "$good"
  docker build --quiet --build-arg GIT_COMMIT_SHA="$good" -t "$API_IMAGE:$good" -f "$REPO/Dockerfiles/api" "$REPO"
  docker build --quiet --build-arg GIT_COMMIT_SHA="$good" -t "$WORKER_IMAGE:$good" \
    -f "$REPO/Dockerfiles/worker" "$REPO"
  derive_image "$API_IMAGE" "$good" "$crashing" "$EXIT_ON_START"
  derive_image "$WORKER_IMAGE" "$good" "$crashing"
  derive_image "$API_IMAGE" "$good" "$next"
  derive_image "$WORKER_IMAGE" "$good" "$next"
  derive_image "$API_IMAGE" "$good" "$stuck"
  derive_image "$WORKER_IMAGE" "$good" "$stuck" "$ALIVE_WITHOUT_WORK"

  step "1. First deploy of a good version"
  code="$(deploy "$good")"
  expect "deploy succeeds" "$code" "0"
  expect "result is recorded" "$(last_result)" "DEPLOYED"
  expect "api runs the version" "$(running_version envault-api)" "$good"
  expect "worker runs the version" "$(running_version envault-worker)" "$good"
  expect "api is healthy" "$(health envault-api)" "healthy"
  expect "worker is healthy" "$(health envault-worker)" "healthy"
  expect "current version is recorded" "$(cat "$REPO/.deploy/current")" "$good"

  step "2. Api exits on start, schema unchanged"
  code="$(deploy "$crashing")"
  expect "deploy fails" "$code" "1"
  expect "result is recorded" "$(last_result)" "FAILED_ROLLED_BACK"
  expect "api runs the previous version" "$(running_version envault-api)" "$good"
  expect "worker runs the previous version" "$(running_version envault-worker)" "$good"
  expect "api is healthy" "$(health envault-api)" "healthy"
  expect "worker is healthy" "$(health envault-worker)" "healthy"
  expect "current version is unchanged" "$(cat "$REPO/.deploy/current")" "$good"
  expect "repository is back at the previous version" "$(git -C "$REPO" rev-parse HEAD)" "$good"

  step "3. Next good version"
  code="$(deploy "$next")"
  expect "deploy succeeds" "$code" "0"
  expect "result is recorded" "$(last_result)" "DEPLOYED"
  expect "api runs the version" "$(running_version envault-api)" "$next"
  expect "worker runs the version" "$(running_version envault-worker)" "$next"
  expect "current version is recorded" "$(cat "$REPO/.deploy/current")" "$next"
  expect "previous version is recorded" "$(cat "$REPO/.deploy/previous")" "$good"

  step "4. Commit without published images"
  code="$(deploy "$unpublished")"
  expect "deploy fails" "$code" "1"
  expect "result is recorded" "$(last_result)" "FAILED_NO_IMAGE"
  expect "api keeps running" "$(running_version envault-api)" "$next"
  expect "worker keeps running" "$(running_version envault-worker)" "$next"
  expect "api is healthy" "$(health envault-api)" "healthy"

  step "5. Worker makes no progress, schema changed"
  code="$(deploy "$stuck")"
  expect "deploy fails" "$code" "1"
  expect "result is recorded" "$(last_result)" "FAILED_NO_ROLLBACK"
  expect "worker is reported unhealthy" "$(health envault-worker)" "unhealthy"
  expect "failed version is left in place" "$(running_version envault-worker)" "$stuck"
  expect "current version still names the last healthy one" "$(cat "$REPO/.deploy/current")" "$next"

  step "Deploy history"
  cat "$REPO/.deploy/history.log"

  step "Result"
  if [[ "$FAILURES" -gt 0 ]]; then
    echo "$FAILURES expectation(s) failed"
    exit 1
  fi
  echo "All scenarios passed"
}

main "$@"; exit
