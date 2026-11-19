#!/usr/bin/env bash
# MYK9-2212: two-session proof of the authorization re-check AFTER the per-club lock in
# grant_club_admin and revoke_club_admin (20261120004700_myk9_2209_club_admin_grant_revoke.sql).
#
# The single-session SQL test can only revoke a caller before their next call, so the first
# check refuses and the post-lock re-check never runs. Here the caller passes the first check,
# blocks on the per-club advisory lock another admin holds, and that other admin removes the
# caller and commits. The caller must then be refused by the re-check (42501, "can change its
# admins", not the first check's "can add/remove an admin") and the target must be unchanged.
# Local loopback migrated database only.

set -Eeuo pipefail

DATABASE_URL="${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}"
# Same rule as run-behavioral-sql-tests.sh: any loopback port, no query string.
LOOPBACK_URL_RE='^postgresql://postgres:postgres@(127\.0\.0\.1|localhost):([0-9]{1,5})/postgres$'
if ! [[ "$DATABASE_URL" =~ $LOOPBACK_URL_RE ]] ||
  [ "${BASH_REMATCH[2]}" -lt 1 ] || [ "${BASH_REMATCH[2]}" -gt 65535 ]; then
  echo "FAIL: club-admin concurrency tests require a local loopback database URL." >&2
  exit 1
fi
unset PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
if ! command -v psql >/dev/null 2>&1; then
  echo "FAIL: psql is required for club-admin concurrency tests." >&2
  exit 1
fi
if ! psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT 1' >/dev/null; then
  echo "FAIL: the exact local Supabase database is not reachable; no fixtures were written." >&2
  exit 1
fi

scratch_dir="$(mktemp -d "${TMPDIR:-/tmp}/myk9-club-admin-concurrency.XXXXXX")"
holder_pid=""
fixtures_created=0
new_uuid() {
  # uuidgen is absent from some Linux images; the kernel source is not on macOS.
  if command -v uuidgen >/dev/null 2>&1; then uuidgen | tr '[:upper:]' '[:lower:]'
  else cat /proc/sys/kernel/random/uuid; fi
}

cleanup() {
  set +e
  { exec 3>&-; } 2>/dev/null
  if [ -n "$holder_pid" ]; then
    kill "$holder_pid" >/dev/null 2>&1
    wait "$holder_pid" >/dev/null 2>&1
  fi
  if [ "$fixtures_created" = "1" ]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
DELETE FROM public.permission_audit_log WHERE user_id IN ('$holder_person_id', '$grant_caller_person_id', '$revoke_caller_person_id');
DELETE FROM public.user_roles WHERE user_id IN ('$holder_person_id', '$grant_caller_person_id', '$grant_target_person_id', '$revoke_caller_person_id', '$revoke_target_person_id');
DELETE FROM public.people WHERE id IN ('$holder_person_id', '$grant_caller_person_id', '$grant_target_person_id', '$revoke_caller_person_id', '$revoke_target_person_id');
DELETE FROM auth.users WHERE id IN ('$holder_auth_id', '$grant_caller_auth_id', '$grant_target_auth_id', '$revoke_caller_auth_id', '$revoke_target_auth_id');
-- Deleting user_roles fires trg_user_roles_touch_access_epoch; the epoch table has no foreign
-- key to auth.users, so its rows for these accounts are removed here, after the roles.
DELETE FROM private.user_access_epoch WHERE auth_user_id IN ('$holder_auth_id', '$grant_caller_auth_id', '$grant_target_auth_id', '$revoke_caller_auth_id', '$revoke_target_auth_id');
DELETE FROM public.clubs WHERE id = '$club_id';
SQL
  fi
  rm -rf "$scratch_dir"
}
trap cleanup EXIT

club_id="$(new_uuid)"
holder_person_id="$(new_uuid)"
holder_auth_id="$(new_uuid)"
grant_caller_person_id="$(new_uuid)"
grant_caller_auth_id="$(new_uuid)"
grant_target_person_id="$(new_uuid)"
grant_target_auth_id="$(new_uuid)"
revoke_caller_person_id="$(new_uuid)"
revoke_caller_auth_id="$(new_uuid)"
revoke_target_person_id="$(new_uuid)"
revoke_target_auth_id="$(new_uuid)"
fixtures_created=1

for fixture_id in "$club_id" "$holder_person_id" "$holder_auth_id" "$grant_caller_person_id" \
  "$grant_caller_auth_id" "$grant_target_person_id" "$grant_target_auth_id" \
  "$revoke_caller_person_id" "$revoke_caller_auth_id" "$revoke_target_person_id" \
  "$revoke_target_auth_id"; do
  if [[ ! "$fixture_id" =~ ^[[:xdigit:]-]{36}$ ]]; then
    echo "FAIL: uuid generation returned an invalid test fixture ID." >&2
    exit 1
  fi
done

# One club. The holder and both callers are active club-wide admins. The grant target has an
# account and no admin row; the revoke target is an admin the revoke caller tries to remove (the
# holder stays an admin, so the last-admin guard is never the reason for a refusal).
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
BEGIN;
INSERT INTO public.clubs (id, name) VALUES ('$club_id', 'MYK9-2212 concurrency $club_id');
INSERT INTO public.people (id, first_name, last_name, email) VALUES
  ('$holder_person_id', 'MYK9-2212', 'Holder', '$holder_person_id@example.test'),
  ('$grant_caller_person_id', 'MYK9-2212', 'GrantCaller', '$grant_caller_person_id@example.test'),
  ('$grant_target_person_id', 'MYK9-2212', 'GrantTarget', '$grant_target_person_id@example.test'),
  ('$revoke_caller_person_id', 'MYK9-2212', 'RevokeCaller', '$revoke_caller_person_id@example.test'),
  ('$revoke_target_person_id', 'MYK9-2212', 'RevokeTarget', '$revoke_target_person_id@example.test');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.auth_id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.person_id || '@example.test', '', now(), now(), now(), now(), '{}', '{}',
       false, false, false
FROM (VALUES
  ('$holder_auth_id', '$holder_person_id'),
  ('$grant_caller_auth_id', '$grant_caller_person_id'),
  ('$grant_target_auth_id', '$grant_target_person_id'),
  ('$revoke_caller_auth_id', '$revoke_caller_person_id'),
  ('$revoke_target_auth_id', '$revoke_target_person_id')
) AS v(auth_id, person_id);
UPDATE public.people p SET auth_user_id = v.auth_id::uuid
FROM (VALUES
  ('$holder_auth_id', '$holder_person_id'),
  ('$grant_caller_auth_id', '$grant_caller_person_id'),
  ('$grant_target_auth_id', '$grant_target_person_id'),
  ('$revoke_caller_auth_id', '$revoke_caller_person_id'),
  ('$revoke_target_auth_id', '$revoke_target_person_id')
) AS v(auth_id, person_id)
WHERE p.id = v.person_id::uuid;
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT v.person_id::uuid, r.id, '$club_id', true, v.auth_id::uuid
FROM public.roles r,
  (VALUES
    ('$holder_person_id', '$holder_auth_id'),
    ('$grant_caller_person_id', '$grant_caller_auth_id'),
    ('$revoke_caller_person_id', '$revoke_caller_auth_id'),
    ('$revoke_target_person_id', '$revoke_target_auth_id')
  ) AS v(person_id, auth_id)
WHERE r.name = 'club_admin';
COMMIT;
SQL

# Count of active club-wide club_admin rows a person holds at the fixture club.
active_admin_rows() {
  psql "$DATABASE_URL" -X -Atq -c \
    "SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = '$1' AND ur.club_id = '$club_id' AND ur.show_id IS NULL
       AND r.name = 'club_admin' AND ur.is_active = true;"
}

wait_for_holder() {
  local app_name="$1" attempt=0
  while [ "$attempt" -lt 100 ]; do
    if [ "$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = '$app_name' AND state = 'idle in transaction' AND query LIKE '%myk9_2212_holding%');" \
      2>/dev/null || true)" = "t" ]; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: holder session $app_name did not enter its lock-holding window." >&2
  return 1
}

wait_for_blocked_caller() {
  local app_name="$1" attempt=0
  while [ "$attempt" -lt 100 ]; do
    if [ "$(psql "$DATABASE_URL" -X -Atq -c \
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name = '$app_name' AND wait_event_type = 'Lock' AND wait_event = 'advisory');" \
      2>/dev/null || true)" = "t" ]; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  echo "FAIL: caller $app_name never blocked on the per-club advisory lock." >&2
  return 1
}

# The holder is a real admin removing the caller through revoke_club_admin, which takes the
# per-club lock; it then keeps its transaction open, reading the rest of its script from a FIFO,
# until release_holder sends COMMIT once the caller is seen queued behind it. Closing the FIFO
# without COMMIT (any failure path) ends psql's input, which rolls the transaction back.
start_holder() {
  local scenario="$1" caller_person_id="$2"
  local app_name="myk9-2212-holder-$scenario-$club_id"
  local fifo="$scratch_dir/$scenario-holder.fifo"
  mkfifo "$fifo"
  PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    >"$scratch_dir/$scenario-holder.log" 2>&1 <"$fifo" &
  holder_pid="$!"
  exec 3>"$fifo"
  cat >&3 <<SQL
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$holder_auth_id', true);
SELECT pg_catalog.set_config('request.jwt.claims', jsonb_build_object('sub', '$holder_auth_id', 'role', 'authenticated', 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch FROM pg_catalog.now())::bigint)))::text, true);
SET LOCAL ROLE authenticated;
SELECT public.revoke_club_admin('$club_id', '$caller_person_id');
SELECT 'myk9_2212_holding';
SQL
  wait_for_holder "$app_name" || {
    exec 3>&-
    cat "$scratch_dir/$scenario-holder.log" >&2
    return 1
  }
}

release_holder() {
  printf 'COMMIT;\n' >&3
  exec 3>&-
}

# The caller is an admin until the holder commits, so it passes the first check, then queues on
# the advisory lock. sql is the statement that calls the function under test.
run_caller() {
  local caller_auth_id="$1" sql="$2" app_name="$3"
  PGAPPNAME="$app_name" psql "$DATABASE_URL" -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL statement_timeout = '30s';
SELECT pg_catalog.set_config('request.jwt.claim.sub', '$caller_auth_id', true);
SELECT pg_catalog.set_config('request.jwt.claims', jsonb_build_object('sub', '$caller_auth_id', 'role', 'authenticated', 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch FROM pg_catalog.now())::bigint)))::text, true);
SET LOCAL ROLE authenticated;
$sql
COMMIT;
SQL
}

expect_recheck_refusal() {
  local scenario="$1" caller_person_id="$2" caller_auth_id="$3" sql="$4"
  local caller_app="myk9-2212-caller-$scenario-$club_id"
  local log_file="$scratch_dir/$scenario-caller.log" caller_pid status

  start_holder "$scenario" "$caller_person_id"
  run_caller "$caller_auth_id" "$sql" "$caller_app" >"$log_file" 2>&1 &
  caller_pid="$!"
  wait_for_blocked_caller "$caller_app" || {
    exec 3>&-
    wait "$caller_pid" || true
    cat "$log_file" >&2
    return 1
  }
  # The caller is queued on the club lock: let the holder's removal of the caller commit now.
  release_holder

  set +e
  wait "$caller_pid"
  status="$?"
  set -e
  if [ "$status" = "0" ] || ! grep -qE '42501' "$log_file" ||
    ! grep -q "can change its admins" "$log_file"; then
    echo "FAIL: $scenario caller was not refused by the post-lock re-check (42501, 'can change its admins')." >&2
    cat "$log_file" >&2
    return 1
  fi

  set +e
  wait "$holder_pid"
  status="$?"
  set -e
  holder_pid=""
  if [ "$status" != "0" ]; then
    echo "FAIL: $scenario holder did not commit." >&2
    cat "$scratch_dir/$scenario-holder.log" >&2
    return 1
  fi
  if [ "$(active_admin_rows "$caller_person_id")" != "0" ]; then
    echo "FAIL: $scenario holder's removal of the caller did not commit." >&2
    return 1
  fi
}

# Grant: the caller tries to make a fresh account an admin. The target must stay a non-admin.
expect_recheck_refusal grant "$grant_caller_person_id" "$grant_caller_auth_id" \
  "SELECT public.grant_club_admin('$club_id', '$grant_target_person_id');"
if [ "$(active_admin_rows "$grant_target_person_id")" != "0" ]; then
  echo "FAIL: grant: the removed admin still made the target an admin." >&2
  exit 1
fi
echo "PASS: grant: a caller removed while queued on the club lock was refused by the re-check; target unchanged."

# Revoke: the caller tries to remove another admin. The target must remain an admin.
expect_recheck_refusal revoke "$revoke_caller_person_id" "$revoke_caller_auth_id" \
  "SELECT public.revoke_club_admin('$club_id', '$revoke_target_person_id');"
if [ "$(active_admin_rows "$revoke_target_person_id")" != "1" ]; then
  echo "FAIL: revoke: the removed admin still removed the target." >&2
  exit 1
fi
echo "PASS: revoke: a caller removed while queued on the club lock was refused by the re-check; target unchanged."

echo "CLUB ADMIN RECHECK CONCURRENCY TESTS PASSED (grant and revoke; local database only)"
