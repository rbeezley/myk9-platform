#!/usr/bin/env bash
# Exercise DDL stability, row-lock deadlocks, and DML compatibility locally.

set -Eeuo pipefail

DATABASE_URL="${1:-${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}}"
ADMIN_AUTH_ID="${2:-}"
CLUB_ID="${3:-}"
HANDLER_PERSON_ID="${4:-}"
OTHER_SHOW_ID="${5:-}"
ENROLLMENT_SHOW_ID="${6:-}"
ENROLLMENT_TRIAL_ID="${7:-}"
CROSS_CLASS_ID="${8:-}"

# Same rule as run-behavioral-sql-tests.sh: any loopback port, no query string.
LOOPBACK_URL_RE='^postgresql://postgres:postgres@(127\.0\.0\.1|localhost):([0-9]{1,5})/postgres$'
if ! [[ "$DATABASE_URL" =~ $LOOPBACK_URL_RE ]] ||
  [ "${BASH_REMATCH[2]}" -lt 1 ] || [ "${BASH_REMATCH[2]}" -gt 65535 ]; then
  echo "FAIL: lock-protocol tests require a local loopback database URL." >&2
  exit 1
fi
unset PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
if [ "$#" -lt 8 ] || ! command -v psql >/dev/null 2>&1; then
  echo "FAIL: psql and the parent concurrency harness fixture IDs are required." >&2
  exit 1
fi
for fixture_id in "$ADMIN_AUTH_ID" "$CLUB_ID" "$HANDLER_PERSON_ID" "$OTHER_SHOW_ID" \
  "$ENROLLMENT_SHOW_ID" "$ENROLLMENT_TRIAL_ID" "$CROSS_CLASS_ID"; do
  if [[ ! "$fixture_id" =~ ^[[:xdigit:]-]{36}$ ]]; then
    echo "FAIL: invalid parent fixture ID supplied to lock-protocol harness." >&2
    exit 1
  fi
done
if ! psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT 1' >/dev/null; then
  echo "FAIL: the exact local Supabase database is not reachable; no fixtures were written." >&2
  exit 1
fi

scratch_dir="$(mktemp -d "${TMPDIR:-/tmp}/myk9-hard-delete-lock-protocol.XXXXXX")"
writer_pid=""
rpc_pid=""
ddl_pid=""
fixtures_created=0
new_uuid() {
  # uuidgen is absent from some Linux images; the kernel source is not on macOS.
  if command -v uuidgen >/dev/null 2>&1; then uuidgen | tr '[:upper:]' '[:lower:]'
  else cat /proc/sys/kernel/random/uuid; fi
}
ddl_child_table="qa_hard_delete_ddl_$(new_uuid | tr -d '-')"

cleanup() {
  set +e
  for pid in "$writer_pid" "$rpc_pid" "$ddl_pid"; do
    if [ -n "$pid" ]; then
      kill "$pid" >/dev/null 2>&1
      wait "$pid" >/dev/null 2>&1
    fi
  done
  if [ "$fixtures_created" = "1" ]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
DROP TABLE IF EXISTS public.$ddl_child_table;
DELETE FROM public.entries WHERE id = '$deadlock_entry_id';
DELETE FROM public.classes WHERE id = '$deadlock_class_id';
DELETE FROM public.trials WHERE id = '$deadlock_trial_id';
DELETE FROM public.shows WHERE id IN ('$ddl_show_id', '$dml_target_show_id', '$deadlock_show_id');
SQL
  fi
  rm -rf "$scratch_dir"
}
trap cleanup EXIT

ddl_show_id="$(new_uuid)"
dml_target_show_id="$(new_uuid)"
deadlock_show_id="$(new_uuid)"
deadlock_trial_id="$(new_uuid)"
deadlock_class_id="$(new_uuid)"
deadlock_entry_id="$(new_uuid)"
fixtures_created=1
for fixture_id in "$ddl_show_id" "$dml_target_show_id" "$deadlock_show_id" \
  "$deadlock_trial_id" "$deadlock_class_id" "$deadlock_entry_id"; do
  if [[ ! "$fixture_id" =~ ^[[:xdigit:]-]{36}$ ]]; then
    echo "FAIL: uuidgen returned an invalid lock-protocol fixture ID." >&2
    exit 1
  fi
done

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
BEGIN;
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('$ddl_show_id', 'MYK9-1472 DDL race', 'AKC', current_date, current_date + 1, '$CLUB_ID', 'draft'),
  ('$dml_target_show_id', 'MYK9-1472 DML target', 'AKC', current_date, current_date + 1, '$CLUB_ID', 'draft'),
  ('$deadlock_show_id', 'MYK9-1472 deadlock race', 'AKC', current_date, current_date + 1, '$CLUB_ID', 'draft');
INSERT INTO public.trials (id, show_id, name, date)
VALUES ('$deadlock_trial_id', '$deadlock_show_id', 'deadlock race trial', current_date);
INSERT INTO public.classes (id, trial_id, name)
VALUES ('$deadlock_class_id', '$deadlock_trial_id', 'deadlock race class');
CREATE TABLE public.$ddl_child_table (id uuid PRIMARY KEY, show_id uuid NOT NULL);
COMMIT;
SQL

wait_for_writer() {
  local app_name="$1" attempt=0
  while [ "$attempt" -lt 200 ]; do
    if [ "$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = '$app_name' AND state = 'active' AND query LIKE '%pg_sleep(5)%');" \
      2>/dev/null || true)" = "t" ]; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: writer session $app_name did not enter its lock-holding window." >&2
  return 1
}

wait_for_marker() {
  local log_file="$1" marker="$2" attempt=0
  while [ "$attempt" -lt 100 ]; do
    if grep -qE "$marker" "$log_file" 2>/dev/null; then return 0; fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: writer did not report $marker." >&2
  return 1
}

wait_for_app_query() {
  local app_name="$1" query_fragment="$2" attempt=0
  while [ "$attempt" -lt 100 ]; do
    if [ "$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = '$app_name' AND state = 'active' AND query LIKE '%$query_fragment%');" \
      2>/dev/null || true)" = "t" ]; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: session $app_name did not enter the expected query window." >&2
  return 1
}

wait_for_ddl_lock_wait() {
  local app_name="$1" attempt=0
  while [ "$attempt" -lt 100 ]; do
    if [ "$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a USING (pid) WHERE a.application_name = '$app_name' AND l.relation = 'public.shows'::pg_catalog.regclass AND l.mode = 'ShareRowExclusiveLock' AND NOT l.granted);" \
      2>/dev/null || true)" = "t" ]; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: FK DDL did not wait on the shows schema-stability lock." >&2
  return 1
}

run_rpc() {
  local show_id="$1" app_name="$2"
  PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$ADMIN_AUTH_ID', true);
SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"$ADMIN_AUTH_ID","role":"authenticated"}', true);
SELECT public.hard_delete_show('$show_id');
COMMIT;
SQL
}

run_deadlock_rpc() {
  local show_id="$1" app_name="$2"
  PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL deadlock_timeout = '500ms';
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$ADMIN_AUTH_ID', true);
SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"$ADMIN_AUTH_ID","role":"authenticated"}', true);
SELECT public.hard_delete_show('$show_id');
COMMIT;
SQL
}

start_deadlock_interleave() {
  local writer_app='myk9-1472-deadlock-lock-holder'
  local rpc_app='myk9-1472-deadlock-rpc'
  local writer_log="$scratch_dir/deadlock-writer.log"
  local rpc_log="$scratch_dir/deadlock-rpc.log"
  local status

  PGAPPNAME="$writer_app" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    >"$writer_log" 2>&1 <<SQL &
BEGIN;
SET LOCAL deadlock_timeout = '1500ms';
SELECT id FROM public.classes WHERE id = '$deadlock_class_id' FOR KEY SHARE;
SELECT 'class_lock_acquired';
DO \$wait_for_rpc\$
DECLARE
  rpc_waiting boolean := false;
BEGIN
  FOR attempt IN 1..500 LOOP
    -- pg_stat_activity is snapshotted once per transaction; without this the
    -- loop never sees the RPC start waiting.
    PERFORM pg_catalog.pg_stat_clear_snapshot();
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.application_name = '$rpc_app'
        AND activity.state = 'active'
        AND activity.wait_event_type = 'Lock'
        AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_locks AS waiting_lock
          WHERE waiting_lock.pid = activity.pid
            AND waiting_lock.locktype = 'transactionid'
            AND NOT waiting_lock.granted
        )
    ) INTO rpc_waiting;
    EXIT WHEN rpc_waiting;
    PERFORM pg_catalog.pg_sleep(0.01);
  END LOOP;
  IF NOT rpc_waiting THEN
    RAISE EXCEPTION 'RPC did not wait on the held class key-share lock';
  END IF;
  RAISE NOTICE 'trial_key_share_after_rpc_wait';
END
\$wait_for_rpc\$;
SELECT id FROM public.trials WHERE id = '$deadlock_trial_id' FOR KEY SHARE;
SELECT 'trial_key_share_after_rpc_wait';
INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES ('$deadlock_entry_id', '$OTHER_SHOW_ID', '$deadlock_class_id', '$deadlock_trial_id', NULL, 'pending');
COMMIT;
SQL
  writer_pid="$!"
  wait_for_marker "$writer_log" 'class_lock_acquired' || {
    cat "$writer_log" >&2
    return 1
  }
  set +e
  run_deadlock_rpc "$deadlock_show_id" "$rpc_app" >"$rpc_log" 2>&1
  status="$?"
  set -e
  if [ "$status" = "0" ] || ! grep -qE '40P01' "$rpc_log"; then
    echo "FAIL: reversed FK lock order did not preserve native 40P01 on the RPC." >&2
    cat "$rpc_log" >&2
    return 1
  fi
  set +e
  wait "$writer_pid"
  status="$?"
  set -e
  writer_pid=""
  if [ "$status" != "0" ] || ! grep -qE 'trial_key_share_after_rpc_wait' "$writer_log"; then
    echo "FAIL: lock-holder did not resume and commit its cross-show entry." >&2
    cat "$writer_log" >&2
    return 1
  fi
  if [ "$(psql "$DATABASE_URL" -X -Atq -c \
    "SELECT EXISTS (SELECT 1 FROM public.entries WHERE id = '$deadlock_entry_id') AND EXISTS (SELECT 1 FROM public.shows WHERE id = '$deadlock_show_id');")" != "t" ]; then
    echo "FAIL: deadlock refusal did not preserve the target and competing entry." >&2
    return 1
  fi
  set +e
  run_rpc "$deadlock_show_id" myk9-1472-deadlock-retry >"$scratch_dir/deadlock-retry.log" 2>&1
  status="$?"
  set -e
  if [ "$status" = "0" ] || ! grep -qE 'MK615' "$scratch_dir/deadlock-retry.log" || \
    ! grep -qiE 'entry in another show' "$scratch_dir/deadlock-retry.log"; then
    echo "FAIL: post-deadlock retry did not refuse committed cross-show evidence." >&2
    cat "$scratch_dir/deadlock-retry.log" >&2
    return 1
  fi
  echo "PASS: class→trial FK-lock interleave produced native 40P01; retry refused the committed entry."
}

expect_dml_compatible() {
  local app_name='myk9-1472-hard-delete-dml-compatible' status
  PGAPPNAME='myk9-1472-dml-lock-holder' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    >"$scratch_dir/dml-lock-holder.log" 2>&1 <<SQL &
BEGIN;
UPDATE public.shows SET name = name WHERE id = '$ENROLLMENT_SHOW_ID';
UPDATE public.trials SET name = name WHERE id = '$ENROLLMENT_TRIAL_ID';
UPDATE public.classes SET name = name WHERE id = '$CROSS_CLASS_ID';
SELECT pg_sleep(5);
COMMIT;
SQL
  writer_pid="$!"
  wait_for_writer myk9-1472-dml-lock-holder
  set +e
  run_rpc "$dml_target_show_id" "$app_name" >"$scratch_dir/dml-compatible-delete.log" 2>&1
  status="$?"
  set -e
  if [ "$status" != "0" ] || ! kill -0 "$writer_pid" >/dev/null 2>&1; then
    echo "FAIL: ordinary writes on unrelated show/trial/class rows were serialized with deletion." >&2
    cat "$scratch_dir/dml-compatible-delete.log" >&2
    return 1
  fi
  if [ "$(psql "$DATABASE_URL" -X -Atq -c \
    "SELECT NOT EXISTS (SELECT 1 FROM public.shows WHERE id = '$dml_target_show_id');")" != "t" ]; then
    echo "FAIL: DML-compatible hard delete did not remove the unused target." >&2
    return 1
  fi
  set +e
  wait "$writer_pid"
  status="$?"
  set -e
  writer_pid=""
  if [ "$status" != "0" ]; then
    echo "FAIL: unrelated DML lock-holder did not commit." >&2
    cat "$scratch_dir/dml-lock-holder.log" >&2
    return 1
  fi
  echo "PASS: ROW EXCLUSIVE DML on unrelated target rows overlapped the delete."
}

start_schema_ddl_race() {
  local rpc_app='myk9-1472-schema-ddl-rpc'
  local ddl_app='myk9-1472-schema-ddl-writer'
  local ddl_constraint='qa_hd_ddl_show_fkey'
  local status

  PGAPPNAME="$rpc_app" psql "$DATABASE_URL" -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 \
    >"$scratch_dir/schema-ddl-rpc.log" 2>&1 <<SQL &
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$ADMIN_AUTH_ID', true);
SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"$ADMIN_AUTH_ID","role":"authenticated"}', true);
SELECT public.hard_delete_show('$ddl_show_id');
SELECT pg_sleep(3);
COMMIT;
SQL
  rpc_pid="$!"
  wait_for_app_query "$rpc_app" 'pg_sleep(3)' || {
    cat "$scratch_dir/schema-ddl-rpc.log" >&2
    return 1
  }

  PGAPPNAME="$ddl_app" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    >"$scratch_dir/schema-ddl-writer.log" 2>&1 <<SQL &
ALTER TABLE public.$ddl_child_table
  ADD CONSTRAINT $ddl_constraint
  FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE;
SQL
  ddl_pid="$!"
  wait_for_ddl_lock_wait "$ddl_app" || {
    cat "$scratch_dir/schema-ddl-writer.log" >&2
    return 1
  }
  set +e
  wait "$rpc_pid"
  status="$?"
  set -e
  rpc_pid=""
  if [ "$status" != "0" ]; then
    echo "FAIL: unused-show deletion did not finish while FK DDL waited." >&2
    cat "$scratch_dir/schema-ddl-rpc.log" >&2
    return 1
  fi
  set +e
  wait "$ddl_pid"
  status="$?"
  set -e
  ddl_pid=""
  if [ "$status" != "0" ]; then
    echo "FAIL: FK DDL did not resume after the delete transaction committed." >&2
    cat "$scratch_dir/schema-ddl-writer.log" >&2
    return 1
  fi
  if [ "$(psql "$DATABASE_URL" -X -Atq -c \
    "SELECT NOT EXISTS (SELECT 1 FROM public.shows WHERE id = '$ddl_show_id') AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = '$ddl_constraint' AND conrelid = 'public.$ddl_child_table'::pg_catalog.regclass);")" != "t" ]; then
    echo "FAIL: the DDL race did not leave the expected post-delete catalog state." >&2
    return 1
  fi
  echo "PASS: ADD FOREIGN KEY waited until the locked catalog-check/delete transaction committed."
}

start_deadlock_interleave
expect_dml_compatible
start_schema_ddl_race
echo "HARD DELETE SHOW LOCK-PROTOCOL TESTS PASSED (deadlock interleave, DML compatibility, FK DDL race; local only)"
