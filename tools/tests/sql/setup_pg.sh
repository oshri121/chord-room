#!/usr/bin/env bash
# Private PostgreSQL cluster for the SQL tests (no system service, no TCP: a Unix socket in the cluster dir).
#   setup_pg.sh start   create the cluster if missing, start it (idempotent)     ← run_all.sh does this
#   setup_pg.sh stop    stop it
#   setup_pg.sh status  print where it is and whether it runs
# Location: $CR_PG (default /var/tmp/chordroom-pg). Socket dir = that folder, port 5499 (socket name only).
# Tests connect with:  psql -h $CR_PG -p 5499 -U postgres
#
# Postgres must be installed (server binaries in /usr/lib/postgresql/<ver>/bin). On Debian/Ubuntu:
#   apt-get update && apt-get install -y postgresql-16     (any 14+ works)
# `pg_ctl` refuses to run as root, so the cluster is owned by the `postgres` user (created if missing) and every
# server command goes through runuser/su. As a normal user it just runs as you.
set -euo pipefail
CR_PG="${CR_PG:-/var/tmp/chordroom-pg}"
PORT=5499
cmd="${1:-start}"

find_bin() {
  local d
  for d in /usr/lib/postgresql/*/bin /usr/pgsql-*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /usr/local/pgsql/bin; do
    [ -x "$d/pg_ctl" ] && { echo "$d"; return; }
  done
  command -v pg_ctl >/dev/null 2>&1 && { dirname "$(command -v pg_ctl)"; return; }
  return 1
}
BIN="$(find_bin 2>/dev/null || true)"
if [ -z "$BIN" ]; then
  echo "setup_pg: PostgreSQL server binaries not found." >&2
  echo "  Debian/Ubuntu:  apt-get update && apt-get install -y postgresql-16" >&2
  echo "  macOS:          brew install postgresql@16" >&2
  exit 3
fi
command -v psql >/dev/null 2>&1 || export PATH="$BIN:$PATH"

# who runs the server
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -r -s /bin/bash -d /var/lib/postgresql postgres
  AS() { runuser -u postgres -- "$@"; }
  OWNER=postgres
else
  AS() { "$@"; }
  OWNER="$(id -un)"
fi

DATA="$CR_PG/data"; LOG="$CR_PG/log"
mkdir -p "$CR_PG"; chown "$OWNER" "$CR_PG"; chmod 755 "$CR_PG"

running() { AS "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; }

case "$cmd" in
  status)
    echo "cluster: $DATA  socket: $CR_PG/.s.PGSQL.$PORT  binaries: $BIN"
    if running; then echo "running"; else echo "stopped"; exit 1; fi ;;
  stop)
    if running; then AS "$BIN/pg_ctl" -D "$DATA" -m fast stop; echo "stopped"; else echo "not running"; fi ;;
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      echo "setup_pg: creating cluster in $DATA"
      AS "$BIN/initdb" -D "$DATA" -U postgres -A trust --locale=C.UTF-8 -E UTF8 >"$CR_PG/initdb.log" 2>&1 || { cat "$CR_PG/initdb.log" >&2; exit 4; }
    fi
    if ! running; then
      AS "$BIN/pg_ctl" -D "$DATA" -o "-k $CR_PG -p $PORT -c listen_addresses='' -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c log_min_messages=warning" -l "$LOG" -w -t 60 start >/dev/null
    fi
    for i in $(seq 1 30); do
      psql -h "$CR_PG" -p "$PORT" -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && { echo "postgres ready at $CR_PG (port $PORT)"; exit 0; }
      sleep 0.5
    done
    echo "setup_pg: server did not answer; see $LOG" >&2; tail -20 "$LOG" >&2; exit 5 ;;
  *) echo "usage: setup_pg.sh start|stop|status" >&2; exit 2 ;;
esac
