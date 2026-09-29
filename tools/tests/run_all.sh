#!/usr/bin/env bash
# Chord Room test suite — one command:   tools/tests/run_all.sh
#   --node | --sql | --ui      run only that group (combine freely)
#   --slow                     also run slow/ (AI stem separation on CPU, ≈ 2–4 min; off by default)
#   -k PATTERN                 only tests whose file name contains PATTERN (e.g. -k auth, -k cues)
#   --no-deps                  don't try to install missing Python packages
#   --keep-pg                  leave the test Postgres running afterwards (default: stop it if we started it)
#   -j N                       run N UI tests in parallel (default: 2 when the machine has ≥ 4 CPUs, else 1)
# Exit code = number of failed tests. Prints a summary table at the end. Logs: $CR_LOGS (default /tmp/chordroom-tests).
# Env: CR_REPO (site tree to test, default = this repo), CR_PG (postgres dir), CR_SHOTS (screenshots dir),
#      PLAYWRIGHT_BROWSERS_PATH (Chromium location; `python3 -m playwright install chromium` if it is missing).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CR_REPO="${CR_REPO:-$(cd "$HERE/../.." && pwd)}"
export CR_PG="${CR_PG:-/var/tmp/chordroom-pg}"
export CR_SHOTS="${CR_SHOTS:-/tmp/chordroom-shots}"
LOGS="${CR_LOGS:-/tmp/chordroom-tests}"
mkdir -p "$LOGS" "$CR_SHOTS"

RUN_NODE=0; RUN_SQL=0; RUN_UI=0; RUN_SLOW=0; PAT=""; DEPS=1; KEEP_PG=0; JOBS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --node) RUN_NODE=1 ;; --sql) RUN_SQL=1 ;; --ui) RUN_UI=1 ;; --slow) RUN_SLOW=1 ;;
    -k) shift; PAT="$1" ;; -k*) PAT="${1#-k}" ;;
    --no-deps) DEPS=0 ;; --keep-pg) KEEP_PG=1 ;;
    -j) shift; JOBS="$1" ;; -j*) JOBS="${1#-j}" ;;
    -h|--help) sed -n 2,12p "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac; shift
done
if [ $RUN_NODE$RUN_SQL$RUN_UI = 000 ]; then RUN_NODE=1; RUN_SQL=1; RUN_UI=1; fi   # --slow alone still runs everything + slow
NCPU=$(nproc 2>/dev/null || echo 2)
[ -z "$JOBS" ] && { [ "$NCPU" -ge 4 ] && JOBS=2 || JOBS=1; }

# ---------- deps
PY=python3
if [ $DEPS = 1 ]; then
  need=""
  $PY -c 'import playwright' 2>/dev/null || need="$need playwright"
  $PY -c 'import numpy' 2>/dev/null || need="$need numpy"
  $PY -c 'import mutagen' 2>/dev/null || need="$need mutagen"
  if [ -n "$need" ]; then
    echo "installing python packages:$need"
    $PY -m pip install -q $need 2>/dev/null || $PY -m pip install -q --break-system-packages $need || echo "  (pip failed — install by hand: pip install$need)" >&2
  fi
fi
if [ $RUN_UI = 1 ]; then
  if ! $PY -c 'import playwright' 2>/dev/null; then echo "playwright is missing: pip install playwright && python3 -m playwright install chromium" >&2; RUN_UI=0; RUN_SLOW=0; fi
fi
if [ $RUN_NODE = 1 ] && ! command -v node >/dev/null 2>&1; then echo "node is missing (need Node 18+): skipping the node group" >&2; RUN_NODE=0; fi

# ---------- collect
declare -a NAMES GRPS CMDS
add() { NAMES+=("$1"); GRPS+=("$2"); CMDS+=("$3"); }
match() { [ -z "$PAT" ] || [[ "$1" == *"$PAT"* ]]; }
if [ $RUN_NODE = 1 ]; then for f in "$HERE"/node/*.test.mjs; do n=$(basename "$f" .test.mjs); match "$n" && add "$n" node "node $f"; done; fi
if [ $RUN_SQL = 1 ]; then for f in "$HERE"/sql/test_*.py; do n=$(basename "$f" .py); match "$n" && add "$n" sql "$PY -u $f"; done; fi
if [ $RUN_UI = 1 ]; then for f in "$HERE"/ui/test_*.py; do n=$(basename "$f" .py); match "$n" && add "$n" ui "$PY -u $f"; done; fi
if [ $RUN_SLOW = 1 ]; then for f in "$HERE"/slow/test_*.py; do n=$(basename "$f" .py); match "$n" && add "$n" slow "$PY -u $f"; done; fi
[ ${#NAMES[@]} -eq 0 ] && { echo "no tests match"; exit 0; }

# ---------- postgres (only when an sql test is selected)
PG_STARTED=0
if printf '%s\n' "${GRPS[@]}" | grep -q '^sql$'; then
  if ! "$HERE/sql/setup_pg.sh" status >/dev/null 2>&1; then
    if "$HERE/sql/setup_pg.sh" start; then PG_STARTED=1; else echo "postgres unavailable: sql tests will fail" >&2; fi
  fi
fi

# ---------- run
declare -a RES DUR SUMS
T0=$(date +%s)
run_one() {   # idx
  local i=$1 n=${NAMES[$1]} log="$LOGS/${NAMES[$1]}.log" t0 t1 rc
  t0=$(date +%s)
  bash -c "${CMDS[$1]}" >"$log" 2>&1; rc=$?
  t1=$(date +%s)
  echo "$rc $((t1 - t0))" >"$log.rc"
}
echo "Chord Room tests · repo $CR_REPO · ${#NAMES[@]} tests · logs in $LOGS"
i=0
while [ $i -lt ${#NAMES[@]} ]; do
  g=${GRPS[$i]}
  if [ "$g" = ui ] && [ "$JOBS" -gt 1 ]; then
    # UI tests: up to $JOBS at once (each has its own server + browser)
    batch=(); while [ $i -lt ${#NAMES[@]} ] && [ "${GRPS[$i]}" = ui ] && [ ${#batch[@]} -lt "$JOBS" ]; do batch+=($i); i=$((i + 1)); done
    for j in "${batch[@]}"; do printf '  %-8s %-28s …\n' "${GRPS[$j]}" "${NAMES[$j]}"; run_one $j & done; wait
  else
    printf '  %-8s %-28s …' "$g" "${NAMES[$i]}"; run_one $i
    read rc d <"$LOGS/${NAMES[$i]}.log.rc"; [ "$rc" = 0 ] && echo " ok (${d}s)" || echo " FAIL (${d}s)"
    i=$((i + 1))
  fi
done
T1=$(date +%s)

# ---------- summary
FAILS=0
printf '\n%-8s %-28s %-6s %6s  %s\n' GROUP TEST RESULT TIME SUMMARY
printf '%s\n' "----------------------------------------------------------------------------------------"
for i in "${!NAMES[@]}"; do
  n=${NAMES[$i]}; log="$LOGS/$n.log"; read rc d <"$log.rc"
  sum=$(grep -E "^[A-Za-z_0-9]+: [0-9]+ ok, [0-9]+ failed|^[0-9]+ ok, [0-9]+ failed" "$log" | tail -1 | sed -E 's/^[A-Za-z_0-9]+: //; s/ \([0-9.]+s\)//')
  [ -z "$sum" ] && sum=$(grep -E "FAIL|Error|error" "$log" | head -1 | cut -c1-70)
  if [ "$rc" = 0 ]; then r=ok; else r=FAIL; FAILS=$((FAILS + 1)); fi
  printf '%-8s %-28s %-6s %5ss  %s\n' "${GRPS[$i]}" "$n" "$r" "$d" "$sum"
done
printf '%s\n' "----------------------------------------------------------------------------------------"
KN=0; for i in "${!NAMES[@]}"; do KN=$((KN + $(grep -c '^  KNOWN' "$LOGS/${NAMES[$i]}.log" 2>/dev/null || true))); done
echo "${#NAMES[@]} tests, $FAILS failed, $((T1 - T0))s total · known app issues reported: $KN (grep KNOWN $LOGS/*.log)"
[ $FAILS -gt 0 ] && echo "failed logs: $(for i in "${!NAMES[@]}"; do read rc d <"$LOGS/${NAMES[$i]}.log.rc"; [ "$rc" != 0 ] && printf '%s ' "$LOGS/${NAMES[$i]}.log"; done)"

if [ $PG_STARTED = 1 ] && [ $KEEP_PG = 0 ]; then "$HERE/sql/setup_pg.sh" stop >/dev/null 2>&1 || true; fi
exit $FAILS
