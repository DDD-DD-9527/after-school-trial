#!/bin/bash
set -Eeuo pipefail

: "${JWT_SECRET:?JWT_SECRET must be configured}"
: "${PORT:=8080}"
: "${DATA_DIR:=/data}"
export PORT DATA_DIR
if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 || PORT == 5281 )); then
    echo 'PORT must be between 1 and 65535 and different from internal API port 5281' >&2
    exit 1
fi
mkdir -p "$DATA_DIR"

# Never run the destructive demo initializer against an existing database.
if [[ ! -e "$DATA_DIR/app.db" ]]; then
    echo 'Initializing a new demo database...'
    npm run db:init --workspace apps/api
fi

envsubst '${PORT}' < /app/deploy/nginx.conf.template > /etc/nginx/conf.d/app.conf
nginx -t
api_pid=''
nginx_pid=''
cleanup() {
    trap - EXIT TERM INT
    [[ -z "$nginx_pid" ]] || kill -QUIT "$nginx_pid" 2>/dev/null || true
    [[ -z "$api_pid" ]] || kill -TERM "$api_pid" 2>/dev/null || true
    wait || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
PORT=5281 node --import tsx apps/api/src/server.ts &
api_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!
# Exit and let the platform restart the container if either service stops.
set +e
wait -n "$api_pid" "$nginx_pid"
status=$?
set -e
if [[ "$status" == 0 ]]; then status=1; fi
exit "$status"
