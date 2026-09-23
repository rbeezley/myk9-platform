#!/usr/bin/env bash
# Exercise hard_delete_show against concurrent writers using only the local
# Supabase URL. Each exact-ID fixture is removed on exit, including failures.

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

new_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

cleanup() {
  set +e
  if [ -n "$writer_pid" ]; then
    kill "$writer_pid" >/dev/null 2>&1
    wait "$writer_pid" >/dev/null 2>&1
    writer_pid=""
  fi

  if [ "$fixtures_created" = "1" ]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
DELETE FROM public.stripe_orders WHERE id = '$order_id';
DELETE FROM public.entries WHERE id IN ('$payment_entry_id', '$array_entry_id', '$cross_entry_id');
DELETE FROM public.enrollments WHERE id IN ('$payment_enrollment_id', '$cross_enrollment_id', '$array_enrollment_id');
DELETE FROM public.classes WHERE id IN ('$payment_class_id', '$cross_class_id', '$array_class_id');
DELETE FROM public.trials WHERE id IN ('$payment_trial_id', '$cross_trial_id', '$array_trial_id');
DELETE FROM public.shows WHERE id IN ('$payment_show_id', '$cross_show_id', '$array_show_id', '$other_show_id');
DELETE FROM public.user_roles WHERE user_id = '$admin_person_id' OR auth_user_id = '$admin_auth_id';
DELETE FROM public.people WHERE id = '$admin_person_id';
DELETE FROM auth.users WHERE id = '$admin_auth_id';
DELETE FROM public.clubs WHERE id = '$club_id';
SQL
  fi

  rm -rf "$scratch_dir"
}
trap cleanup EXIT

club_id="$(new_uuid)"
admin_person_id="$(new_uuid)"
admin_auth_id="$(new_uuid)"
payment_show_id="$(new_uuid)"
cross_show_id="$(new_uuid)"
array_show_id="$(new_uuid)"
other_show_id="$(new_uuid)"
payment_trial_id="$(new_uuid)"
cross_trial_id="$(new_uuid)"
array_trial_id="$(new_uuid)"
payment_class_id="$(new_uuid)"
cross_class_id="$(new_uuid)"
array_class_id="$(new_uuid)"
payment_enrollment_id="$(new_uuid)"
cross_enrollment_id="$(new_uuid)"
array_enrollment_id="$(new_uuid)"
payment_entry_id="$(new_uuid)"
cross_entry_id="$(new_uuid)"
array_entry_id="$(new_uuid)"
order_id="$(new_uuid)"

for fixture_id in \
  "$club_id" "$admin_person_id" "$admin_auth_id" "$payment_show_id" \
  "$cross_show_id" "$array_show_id" "$other_show_id" "$payment_trial_id" \
  "$cross_trial_id" "$array_trial_id" "$payment_class_id" "$cross_class_id" \
  "$array_class_id" "$payment_enrollment_id" "$cross_enrollment_id" \
  "$array_enrollment_id" "$payment_entry_id" "$cross_entry_id" "$array_entry_id" \
  "$order_id"; do
  if [[ ! "$fixture_id" =~ ^[[:xdigit:]-]{36}$ ]]; then
    echo "FAIL: uuidgen returned an invalid fixture ID." >&2
    exit 1
  fi
done

fixtures_created=1
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
BEGIN;
INSERT INTO public.clubs (id, name)
VALUES ('$club_id', 'MYK9-615 local concurrency fixture');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('$admin_person_id', 'MYK9', 'Concurrency Admin',
        'myk9-615-concurrency-' || '$admin_person_id' || '@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '$admin_auth_id', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'myk9-615-concurrency-$admin_person_id@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false
);

UPDATE public.people SET auth_user_id = '$admin_auth_id' WHERE id = '$admin_person_id';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '$admin_person_id'::uuid, r.id, NULL::uuid, true, '$admin_auth_id'::uuid
FROM public.roles r
WHERE r.name = 'site_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('$payment_show_id', 'MYK9-615 payment concurrency', 'AKC', DATE '2026-09-01', DATE '2026-09-02', '$club_id', 'draft'),
  ('$cross_show_id', 'MYK9-615 cross-show concurrency', 'AKC', DATE '2026-09-01', DATE '2026-09-02', '$club_id', 'draft'),
  ('$array_show_id', 'MYK9-615 array concurrency', 'AKC', DATE '2026-09-01', DATE '2026-09-02', '$club_id', 'draft'),
  ('$other_show_id', 'MYK9-615 other concurrency show', 'AKC', DATE '2026-09-01', DATE '2026-09-02', '$club_id', 'draft');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('$payment_trial_id', '$payment_show_id', 'payment concurrency', DATE '2026-09-01'),
  ('$cross_trial_id', '$cross_show_id', 'cross-show concurrency', DATE '2026-09-01'),
  ('$array_trial_id', '$array_show_id', 'array concurrency', DATE '2026-09-01');

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('$payment_class_id', '$payment_trial_id', 'payment concurrency'),
  ('$cross_class_id', '$cross_trial_id', 'cross-show concurrency'),
  ('$array_class_id', '$array_trial_id', 'array concurrency');

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES
  ('$payment_enrollment_id', '$payment_show_id', '$admin_person_id', 'pending'),
  ('$cross_enrollment_id', '$cross_show_id', '$admin_person_id', 'pending'),
  ('$array_enrollment_id', '$array_show_id', '$admin_person_id', 'pending');

INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES
  ('$payment_entry_id', '$payment_show_id', '$payment_class_id', '$payment_trial_id', '$payment_enrollment_id', 'pending'),
  ('$array_entry_id', '$array_show_id', '$array_class_id', '$array_trial_id', '$array_enrollment_id', 'pending');
COMMIT;
SQL

wait_for_writer() {
  local app_name="$1"
  local attempt="0"
  local ready=""
  while [ "$attempt" -lt 100 ]; do
    ready="$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = '$app_name' AND state = 'active' AND query LIKE '%pg_sleep(5)%');" \
      2>/dev/null || true)"
    if [ "$ready" = "t" ]; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: writer session $app_name did not enter its lock-holding window." >&2
  return 1
}

start_writer() {
  local scenario="$1"
  local app_name="myk9-615-concurrency-$scenario"
  case "$scenario" in
    payment-update)
      PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >"$scratch_dir/$scenario-writer.log" 2>&1 <<SQL &
BEGIN;
UPDATE public.enrollments SET payment_reference = 'MYK9-615 concurrent payment' WHERE id = '$payment_enrollment_id';
SELECT pg_sleep(5);
COMMIT;
SQL
      ;;
    cross-show-entry)
      PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >"$scratch_dir/$scenario-writer.log" 2>&1 <<SQL &
BEGIN;
INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES ('$cross_entry_id', '$other_show_id', '$cross_class_id', '$cross_trial_id', '$cross_enrollment_id', 'pending');
SELECT pg_sleep(5);
COMMIT;
SQL
      ;;
    entry-id-array)
      PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >"$scratch_dir/$scenario-writer.log" 2>&1 <<SQL &
BEGIN;
INSERT INTO public.stripe_orders (id, amount_cents, status, entry_ids)
VALUES ('$order_id', 1000, 'succeeded', ARRAY['$array_entry_id'::uuid]);
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
  if ! wait_for_writer "$app_name"; then
    cat "$scratch_dir/$scenario-writer.log" >&2
    return 1
  fi
}

run_rpc() {
  local show_id="$1"
  PGAPPNAME='myk9-615-hard-delete-client' psql "$DATABASE_URL" -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$admin_auth_id', true);
SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"$admin_auth_id","role":"authenticated"}', true);
SELECT public.hard_delete_show('$show_id');
COMMIT;
SQL
}

expect_timeout_then_refusal() {
  local scenario="$1"
  local show_id="$2"
  local refusal_text="$3"
  local log_file="$scratch_dir/$scenario-delete.log"
  local status="0"

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

  if [ "$(psql "$DATABASE_URL" -X -Atq -c "SELECT EXISTS (SELECT 1 FROM public.shows WHERE id = '$show_id');")" != "t" ]; then
    echo "FAIL: $scenario lock timeout removed its target show." >&2
    return 1
  fi

  set +e
  wait "$writer_pid"
  local writer_status="$?"
  set -e
  writer_pid=""
  if [ "$writer_status" != "0" ]; then
    echo "FAIL: $scenario writer did not commit its transaction." >&2
    cat "$scratch_dir/$scenario-writer.log" >&2
    return 1
  fi

  set +e
  run_rpc "$show_id" >"$log_file" 2>&1
  status="$?"
  set -e
  if [ "$status" = "0" ] || ! rg -q '23503' "$log_file" || ! rg -qi "$refusal_text" "$log_file"; then
    echo "FAIL: $scenario did not refuse after the writer committed." >&2
    cat "$log_file" >&2
    return 1
  fi

  echo "PASS: $scenario timed out safely, then refused the committed evidence."
}

start_writer payment-update
expect_timeout_then_refusal payment-update "$payment_show_id" 'payment evidence'

start_writer cross-show-entry
expect_timeout_then_refusal cross-show-entry "$cross_show_id" 'cross-show entry association'

start_writer entry-id-array
expect_timeout_then_refusal entry-id-array "$array_show_id" 'Stripe orders'

echo "HARD DELETE SHOW CONCURRENCY TESTS PASSED (3 two-session scenarios; local database only)"
