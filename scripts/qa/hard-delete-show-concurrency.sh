#!/usr/bin/env bash
# Verify target row locks against only the exact local migrated database.

set -Eeuo pipefail

DATABASE_URL="${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}"
LOCAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if [ "$DATABASE_URL" != "$LOCAL_DATABASE_URL" ]; then
  echo "FAIL: hard-delete concurrency tests require the exact local loopback database URL." >&2
  exit 1
fi
unset PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
if ! command -v psql >/dev/null 2>&1; then
  echo "FAIL: psql is required for hard-delete concurrency tests." >&2
  exit 1
fi
if [ "${MYK9_SKIP_HARD_DELETE_CONCURRENCY:-0}" = "1" ]; then
  echo "SKIP: concurrency harness source-contract test uses a fake psql executable."
  exit 0
fi
if ! psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT 1' >/dev/null; then
  echo "FAIL: the exact local Supabase database is not reachable; no fixtures were written." >&2
  exit 1
fi

scratch_dir="$(mktemp -d "${TMPDIR:-/tmp}/myk9-hard-delete-concurrency.XXXXXX")"
writer_pid=""
fixtures_created=0
new_uuid() { uuidgen | tr '[:upper:]' '[:lower:]'; }

cleanup() {
  set +e
  if [ -n "$writer_pid" ]; then
    kill "$writer_pid" >/dev/null 2>&1
    wait "$writer_pid" >/dev/null 2>&1
  fi
  if [ "$fixtures_created" = "1" ]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
DELETE FROM public.entries WHERE id = '$cross_entry_id';
DELETE FROM public.enrollments WHERE id = '$enrollment_id';
DELETE FROM public.classes WHERE id = '$cross_class_id';
DELETE FROM public.trials WHERE id IN ('$enrollment_trial_id', '$cross_trial_id');
DELETE FROM public.shows WHERE id IN ('$enrollment_show_id', '$cross_show_id', '$other_show_id');
DELETE FROM public.user_roles WHERE user_id = '$admin_person_id' OR auth_user_id = '$admin_auth_id';
DELETE FROM public.people WHERE id IN ('$handler_person_id', '$admin_person_id');
DELETE FROM auth.users WHERE id = '$admin_auth_id';
DELETE FROM public.clubs WHERE id = '$club_id';
SQL
  fi
  rm -rf "$scratch_dir"
}
trap cleanup EXIT

club_id="$(new_uuid)"
handler_person_id="$(new_uuid)"
admin_person_id="$(new_uuid)"
admin_auth_id="$(new_uuid)"
enrollment_show_id="$(new_uuid)"
cross_show_id="$(new_uuid)"
other_show_id="$(new_uuid)"
enrollment_trial_id="$(new_uuid)"
cross_trial_id="$(new_uuid)"
cross_class_id="$(new_uuid)"
enrollment_id="$(new_uuid)"
cross_entry_id="$(new_uuid)"
fixtures_created=1

for fixture_id in "$club_id" "$handler_person_id" "$admin_person_id" "$admin_auth_id" \
  "$enrollment_show_id" "$cross_show_id" "$other_show_id" "$enrollment_trial_id" \
  "$cross_trial_id" "$cross_class_id" "$enrollment_id" "$cross_entry_id"; do
  if [[ ! "$fixture_id" =~ ^[[:xdigit:]-]{36}$ ]]; then
    echo "FAIL: uuidgen returned an invalid test fixture ID." >&2
    exit 1
  fi
done

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
BEGIN;
INSERT INTO public.clubs (id, name) VALUES ('$club_id', 'MYK9-615 concurrency');
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id) VALUES
  ('$handler_person_id', 'MYK9-615', 'Handler', '$handler_person_id@example.test', NULL),
  ('$admin_person_id', 'MYK9-615', 'Admin', '$admin_person_id@example.test', NULL);
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES (
  '$admin_auth_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  '$admin_person_id@example.test', '', now(), now(), now(), '{}', '{}', false, false, false
);
UPDATE public.people SET auth_user_id = '$admin_auth_id' WHERE id = '$admin_person_id';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '$admin_person_id', roles.id, NULL, true, '$admin_auth_id'
FROM public.roles WHERE roles.name = 'site_admin';
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('$enrollment_show_id', 'MYK9-615 enrollment race', 'AKC', current_date, current_date + 1, '$club_id', 'draft'),
  ('$cross_show_id', 'MYK9-615 cross-show race', 'AKC', current_date, current_date + 1, '$club_id', 'draft'),
  ('$other_show_id', 'MYK9-615 other race', 'AKC', current_date, current_date + 1, '$club_id', 'draft');
INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('$enrollment_trial_id', '$enrollment_show_id', 'enrollment race trial', current_date),
  ('$cross_trial_id', '$cross_show_id', 'entry race trial', current_date);
INSERT INTO public.classes (id, trial_id, name)
VALUES ('$cross_class_id', '$cross_trial_id', 'entry race class');
COMMIT;
SQL

wait_for_writer() {
  local app_name="$1"
  local attempt=0
  while [ "$attempt" -lt 100 ]; do
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

# Each scenario verifies the bounded lock timeout, then an operator retry after
# the writer commits and leaves retained evidence behind.
start_writer() {
  local scenario="$1"
  local app_name="myk9-615-concurrency-$scenario"
  case "$scenario" in
    enrollment-insert)
      PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
        >"$scratch_dir/$scenario-writer.log" 2>&1 <<SQL &
BEGIN;
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('$enrollment_id', '$enrollment_show_id', '$handler_person_id', 'pending');
SELECT pg_sleep(5);
COMMIT;
SQL
      ;;
    cross-show-entry)
      PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
        >"$scratch_dir/$scenario-writer.log" 2>&1 <<SQL &
BEGIN;
INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES ('$cross_entry_id', '$other_show_id', '$cross_class_id', '$cross_trial_id', NULL, 'pending');
SELECT pg_sleep(5);
COMMIT;
SQL
      ;;
    *)
      echo "FAIL: unsupported concurrency scenario $scenario." >&2
      return 1
      ;;
  esac
  writer_pid="$!"
  wait_for_writer "$app_name" || {
    cat "$scratch_dir/$scenario-writer.log" >&2
    return 1
  }
}

run_rpc() {
  local show_id="$1"
  PGAPPNAME='myk9-615-hard-delete-client' psql "$DATABASE_URL" -X \
    -v VERBOSITY=verbose -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$admin_auth_id', true);
SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"$admin_auth_id","role":"authenticated"}', true);
SELECT public.hard_delete_show('$show_id');
COMMIT;
SQL
}

expect_timeout_then_refusal() {
  local scenario="$1" show_id="$2" refusal_text="$3"
  local log_file="$scratch_dir/$scenario-delete.log" status evidence_exists
  set +e
  run_rpc "$show_id" >"$log_file" 2>&1
  status="$?"
  set -e
  if [ "$status" = "0" ] || ! rg -q '55P03' "$log_file" || \
    ! rg -qi 'operator may retry.*automated retries are disabled' "$log_file"; then
    echo "FAIL: $scenario did not fail closed on the bounded lock timeout." >&2
    cat "$log_file" >&2
    return 1
  fi
  if [ "$(psql "$DATABASE_URL" -X -Atq -c \
    "SELECT EXISTS (SELECT 1 FROM public.shows WHERE id = '$show_id');")" != "t" ]; then
    echo "FAIL: $scenario lock timeout removed its target show." >&2
    return 1
  fi
  set +e
  wait "$writer_pid"
  status="$?"
  set -e
  writer_pid=""
  if [ "$status" != "0" ]; then
    echo "FAIL: $scenario writer did not commit." >&2
    cat "$scratch_dir/$scenario-writer.log" >&2
    return 1
  fi
  set +e
  run_rpc "$show_id" >"$log_file" 2>&1
  status="$?"
  set -e
  if [ "$status" = "0" ] || ! rg -q '23503' "$log_file" || ! rg -qi "$refusal_text" "$log_file"; then
    echo "FAIL: $scenario operator retry did not refuse the committed evidence." >&2
    cat "$log_file" >&2
    return 1
  fi
  if [ "$scenario" = "enrollment-insert" ]; then
    evidence_exists="$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE id = '$enrollment_id');")"
  else
    evidence_exists="$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM public.entries WHERE id = '$cross_entry_id');")"
  fi
  if [ "$evidence_exists" != "t" ] || [ "$(psql "$DATABASE_URL" -X -Atq -c \
    "SELECT EXISTS (SELECT 1 FROM public.shows WHERE id = '$show_id');")" != "t" ]; then
    echo "FAIL: $scenario operator refusal did not preserve show and child evidence." >&2
    return 1
  fi
  echo "PASS: $scenario timed out safely, then refused committed evidence."
}

start_writer enrollment-insert
expect_timeout_then_refusal enrollment-insert "$enrollment_show_id" 'entries or enrollments'
start_writer cross-show-entry
expect_timeout_then_refusal cross-show-entry "$cross_show_id" 'cross-show entry association'

bash "$(dirname "$0")/hard-delete-show-lock-protocol.sh" "$DATABASE_URL" "$admin_auth_id" "$club_id" \
  "$handler_person_id" "$other_show_id" "$enrollment_show_id" "$enrollment_trial_id" "$cross_class_id"

echo "HARD DELETE SHOW CONCURRENCY TESTS PASSED (2 insert races plus lock protocol; local database only)"
