#!/usr/bin/env bash
# Behavioural check for supabase/ops/walk-residue-cleanup.sql (MYK9-734)
# against a THROWAWAY local Postgres. The fixture drops schema public, so the
# URL must point at localhost; anything else is refused before a statement runs.
#
#   WALK_RESIDUE_TEST_DB_URL=postgresql://postgres@localhost:55439/postgres \
#     bash scripts/qa/walk-residue-cleanup-local.sh
#
# Exits 0 only when every case behaves as stated; prints PASS/FAIL per case.
set -uo pipefail

url="${WALK_RESIDUE_TEST_DB_URL:-}"
case "$url" in
  postgresql://*@localhost[:/]* | postgresql://*@127.0.0.1[:/]* | postgres://*@localhost[:/]* | postgres://*@127.0.0.1[:/]*) ;;
  *)
    echo "walk-residue-cleanup-local: WALK_RESIDUE_TEST_DB_URL must be a localhost Postgres URL (got '${url:-<unset>}'); refusing." >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
script="$root/supabase/ops/walk-residue-cleanup.sql"
fixture="$root/scripts/qa/walk-residue-cleanup-local-fixture.sql"
failures=0

q() { psql "$url" -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
run() { psql "$url" -X -q -v ON_ERROR_STOP=1 "$@" -f "$script" 2>&1; }
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
counts() {
  q "select (select count(*) from dogs)||'/'||(select count(*) from entries)||'/'||(select count(*) from stripe_orders)||'/'||(select count(*) from enrollments)||'/'||(select count(*) from entry_status_history)||'/'||(select count(*) from dog_registrations)"
}
sha_of() { printf '%s\n' "$1" | sed -n 's/^RECORD SHA256 \([0-9a-f]*\)$/\1/p'; }

psql "$url" -X -q -v ON_ERROR_STOP=1 -f "$fixture" >/dev/null || { echo "fixture failed" >&2; exit 1; }
start="$(counts)"

# 1. Record mode deletes nothing and prints a record naming run A's rows.
out="$(run -v token='2026-09-13 0305')"
sha_a="$(sha_of "$out")"
if [ -n "$sha_a" ] && [ "$(counts)" = "$start" ] \
  && grep -q '"cs_test_runA"' <<<"$out" && grep -q 'ZZ Walk Dog 2026-09-13 0305 #2' <<<"$out" \
  && ! grep -q '00000000-0000-0000-0000-0000000000d9' <<<"$out" && grep -q 'RECORD ONLY' <<<"$out"; then
  pass "record mode: prints run A's record and a SHA, deletes nothing, ignores another owner's same-named dog"
else
  fail "record mode"; printf '%s\n' "$out" | tail -5
fi

# 2. A second record of the same state hashes identically.
[ "$(sha_of "$(run -v token='2026-09-13 0305')")" = "$sha_a" ] && pass "record is deterministic" || fail "record is deterministic"

# 3. A prefix token is refused.
out="$(run -v token='2026-09-13')"
if grep -q 'not an exact run token' <<<"$out" && [ "$(counts)" = "$start" ]; then pass "prefix token refused"; else fail "prefix token refused"; fi

# 4. A wrong SHA is refused and deletes nothing.
out="$(run -v token='2026-09-13 0305' -v apply_sha=deadbeef)"
if grep -q 'no longer matches the recorded state' <<<"$out" && [ "$(counts)" = "$start" ]; then pass "wrong SHA refused"; else fail "wrong SHA refused"; fi

# 5. A change between record and apply is refused.
q "update dogs set updated_at = '2026-09-14 00:00+00' where id = '00000000-0000-0000-0000-0000000000d1'" >/dev/null
out="$(run -v token='2026-09-13 0305' -v apply_sha="$sha_a")"
if grep -q 'no longer matches the recorded state' <<<"$out" && [ "$(counts)" = "$start" ]; then pass "state change after record refused"; else fail "state change after record refused"; fi
sha_a="$(sha_of "$(run -v token='2026-09-13 0305')")"

# 6. Apply with the recorded SHA removes run A only; the shared enrollment stays
#    because run B's entry still uses it.
out="$(run -v token='2026-09-13 0305' -v apply_sha="$sha_a")"
left_a="$(q "select count(*) from dogs where name like 'ZZ Walk Dog 2026-09-13 0305 #%' and owner_id = '00000000-0000-0000-0000-00000000e001'")"
kept="$(q "select (select count(*) from dogs where id in ('00000000-0000-0000-0000-0000000000d0','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d9'))||'/'||(select count(*) from enrollments)||'/'||(select count(*) from stripe_orders where id = '00000000-0000-0000-0000-0000000000c3')||'/'||(select count(*) from entry_status_history)||'/'||(select count(*) from entry_cart_items)||'/'||(select count(*) from armbands)")"
if grep -q 'APPLIED' <<<"$out" && [ "$left_a" = "0" ] && [ "$kept" = "3/1/1/0/0/0" ]; then
  pass "apply removes run A (dogs, entry, history, order, cart, armband) and keeps run B, the seeded dog and the shared enrollment"
else
  fail "apply run A (left=$left_a kept=$kept)"; printf '%s\n' "$out" | tail -5
fi

# 7. Cleaning run B, the last user of the enrollment, removes the enrollment too.
sha_b="$(sha_of "$(run -v token='2026-09-20 0305')")"
out="$(run -v token='2026-09-20 0305' -v apply_sha="$sha_b")"
if grep -q 'APPLIED' <<<"$out" && [ "$(q "select count(*) from enrollments")" = "0" ]; then pass "last run removes the now-unused enrollment"; else fail "last run removes the enrollment"; printf '%s\n' "$out" | tail -5; fi

# 8. A mixed order (also paid for a seeded entry) is refused.
out="$(run -v token='2026-09-21 0305')"
if grep -q 'also paid for entries outside' <<<"$out"; then pass "mixed order refused"; else fail "mixed order refused"; fi

# 9. An order with a refund row is refused.
out="$(run -v token='2026-09-22 0305')"
if grep -q 'refund row' <<<"$out"; then pass "refunded order refused"; else fail "refunded order refused"; fi

# 10. An unrecorded cascading child is refused, named.
out="$(run -v token='2026-09-23 0305')"
if grep -q 'some_future_ledger' <<<"$out"; then pass "unrecorded cascading child refused"; else fail "unrecorded cascading child refused"; printf '%s\n' "$out" | tail -3; fi

# 11. A token that matches nothing is refused.
out="$(run -v token='2030-01-01 0000')"
if grep -q 'nothing to do' <<<"$out"; then pass "unknown token refused"; else fail "unknown token refused"; fi

# 12. The seeded dog and its entry are untouched after everything.
[ "$(q "select count(*) from entries where id = '00000000-0000-0000-0000-0000000000a0'")" = "1" ] && pass "seeded entry untouched" || fail "seeded entry untouched"

if [ "$failures" -eq 0 ]; then echo "walk-residue-cleanup-local: all cases passed"; exit 0; fi
echo "walk-residue-cleanup-local: $failures case(s) failed"; exit 1
