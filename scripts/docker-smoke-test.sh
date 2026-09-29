#!/usr/bin/env bash
# Boot a built image against an empty data directory and check that it serves
# requests. CI runs this before pushing to GHCR, so Watchtower never pulls an
# image that cannot start.
#
# Usage:
#   docker build -t filmpick-smoke .
#   bash scripts/docker-smoke-test.sh filmpick-smoke
#
# Env: SMOKE_PORT (host port, default 4000), SMOKE_TIMEOUT (seconds, default 60).
set -euo pipefail

image="${1:?usage: $0 <image>}"
port="${SMOKE_PORT:-4000}"
timeout="${SMOKE_TIMEOUT:-60}"

data_dir="$(mktemp -d)"
# The container runs as the unprivileged nextjs user (uid 1001), which must be
# able to create the SQLite file in the mounted directory.
chmod 777 "$data_dir"
container_id=""

cleanup() {
  if [ -n "$container_id" ]; then
    docker rm -f "$container_id" >/dev/null 2>&1 || true
  fi
  rm -rf "$data_dir"
}
trap cleanup EXIT

fail() {
  echo "smoke test failed: $1" >&2
  if [ -n "$container_id" ]; then
    echo "--- container logs ---" >&2
    docker logs "$container_id" >&2 || true
  fi
  exit 1
}

# Placeholder key only: startup must not depend on a real TMDb token.
container_id="$(docker run -d -p "127.0.0.1:${port}:4000" \
  -v "${data_dir}:/app/data" \
  -e TMDB_API_KEY=smoke-test-placeholder \
  "$image")"

# `/` proves the standalone server boots; `/api/settings` opens SQLite through
# better-sqlite3 and runs the schema migrations, which `/` alone would not.
routes=("/" "/api/settings")

deadline=$((SECONDS + timeout))
until curl -fs -o /dev/null "http://127.0.0.1:${port}/"; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$container_id")" != "true" ]; then
    fail "container exited before serving requests"
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    fail "no response on port ${port} within ${timeout}s"
  fi
  sleep 2
done

for route in "${routes[@]}"; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}${route}")"
  case "$status" in
    2??) echo "ok: GET ${route} -> ${status}" ;;
    *) fail "GET ${route} returned ${status}" ;;
  esac
done

[ -f "${data_dir}/movies.db" ] || fail "no movies.db created in the data volume"

echo "smoke test passed"
