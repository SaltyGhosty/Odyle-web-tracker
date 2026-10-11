#!/usr/bin/env bash
# Ejecuta toda la batería del servidor contra un PostgreSQL 16 REAL y desechable (pg-mem ignora bloqueos de fila
# y parte del SQL). Crea un clúster en un directorio temporal, lo arranca en un puerto libre solo en 127.0.0.1,
# crea una base, ejecuta `node --test` con TEST_DATABASE_URL (makeTestApp usa un esquema nuevo por app) y al
# terminar para y borra el clúster. Uso: bash server/scripts/test-pg.sh [argumentos extra para node --test]
set -euo pipefail

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for b in initdb pg_ctl createdb pg_isready; do
  [ -x "$PG_BIN/$b" ] || { echo "test-pg: no encuentro $PG_BIN/$b" >&2; exit 2; }
done

# initdb no se ejecuta como root: en ese caso el clúster pertenece al usuario postgres (o nobody).
RUN=()
if [ "$(id -u)" = "0" ]; then
  if id postgres >/dev/null 2>&1; then PGUSER_OS=postgres; else PGUSER_OS=nobody; fi
  RUN=(runuser -u "$PGUSER_OS" --)
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/odyle-pg-XXXXXX")"
DATA="$TMP/data"
SOCK="$TMP/sock"
mkdir -p "$SOCK"
[ ${#RUN[@]} -gt 0 ] && chown -R "$PGUSER_OS" "$TMP"

PORT="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"

cleanup() {
  "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

"${RUN[@]}" "$PG_BIN/initdb" -D "$DATA" -U odyle --auth=trust -E UTF8 --locale=C.UTF-8 >"$TMP/initdb.log" 2>&1 \
  || { cat "$TMP/initdb.log" >&2; exit 1; }
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -l "$TMP/pg.log" -w -t 30 \
  -o "-p $PORT -k $SOCK -c listen_addresses=127.0.0.1 -c max_connections=600 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
  start >/dev/null || { cat "$TMP/pg.log" >&2; exit 1; }
"${RUN[@]}" "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U odyle odyle_test

export TEST_DATABASE_URL="postgres://odyle@127.0.0.1:$PORT/odyle_test"
echo "test-pg: PostgreSQL $("$PG_BIN/postgres" --version | awk '{print $3}') en 127.0.0.1:$PORT (desechable)"

cd "$SERVER_DIR"
set +e
node --test "$@"
STATUS=$?
set -e
exit $STATUS
