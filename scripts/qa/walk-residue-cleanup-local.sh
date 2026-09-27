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

# Split off the query string first. libpq's own host=/hostaddr= key there
# overrides the URL's embedded host outright, so a URL whose visible host
# looks like localhost can still connect somewhere else entirely (Codex P2
# on #2453, MYK9-734: `...localhost/postgres?host=remote` passed the old
# check and the fixture then dropped schema public there). Refuse outright
# rather than trying to parse and out-guess libpq's own precedence rules.
url_base="${url%%\?*}"
url_query="${url#"$url_base"}"
url_query_lower="$(printf '%s' "$url_query" | tr '[:upper:]' '[:lower:]')"

# libpq percent-decodes a query string BEFORE reading its keys, so
# `?%68ost=remote` or `?host%61ddr=remote` decode to host=/hostaddr= at
# connect time even though neither literal key appears here (Codex finding on
# this PR: the plain-text check above missed exactly this). Refuse any `%` in
# the query string outright rather than writing a decoder to out-guess libpq:
# a throwaway local test URL never legitimately needs one.
case "$url_query_lower" in
  *'%'*)
    echo "walk-residue-cleanup-local: WALK_RESIDUE_TEST_DB_URL's query string contains a percent-encoded character, which could decode to a host=/hostaddr= override at connect time; refusing." >&2
    exit 2
    ;;
esac

case "&${url_query_lower#\?}&" in
  *'&host='* | *'&hostaddr='*)
    echo "walk-residue-cleanup-local: WALK_RESIDUE_TEST_DB_URL's query string sets host=/hostaddr=, which libpq honors over the URL's own host; refusing." >&2
    exit 2
    ;;
esac

case "$url_base" in
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

# 11. A NULL Checkout session id is refused: the check is a positive cs_test_
#     requirement, not merely "not cs_live_" (Codex P1 on #2453, MYK9-734).
out="$(run -v token='2026-09-24 0305')"
if grep -q 'not a verified sandbox' <<<"$out" && grep -q '<null>' <<<"$out"; then
  pass "order with a null Checkout session id refused"
else
  fail "order with a null Checkout session id refused"; printf '%s\n' "$out" | tail -3
fi

# 12. A Checkout session id that is neither cs_test_ nor cs_live_ is refused
#     too -- an unrecognized/malformed value must not pass by default.
out="$(run -v token='2026-09-25 0305')"
if grep -q 'not a verified sandbox' <<<"$out" && grep -q 'sess_malformed' <<<"$out"; then
  pass "order with a malformed Checkout session id refused"
else
  fail "order with a malformed Checkout session id refused"; printf '%s\n' "$out" | tail -3
fi

# 12b. A session id shaped so LIKE's own wildcards (the underscores in
#      'cs_test_') match it is refused too: the check is a LITERAL prefix
#      comparison, not an unescaped LIKE pattern (Codex finding on this PR).
out="$(run -v token='2026-09-26 0305')"
if grep -q 'not a verified sandbox' <<<"$out" && grep -q 'csXtestY123' <<<"$out"; then
  pass "order with a LIKE-wildcard-shaped session id refused"
else
  fail "order with a LIKE-wildcard-shaped session id refused"; printf '%s\n' "$out" | tail -3
fi

# 13. A token that matches nothing is refused.
out="$(run -v token='2030-01-01 0000')"
if grep -q 'nothing to do' <<<"$out"; then pass "unknown token refused"; else fail "unknown token refused"; fi

# 14. The seeded dog and its entry are untouched after everything.
[ "$(q "select count(*) from entries where id = '00000000-0000-0000-0000-0000000000a0'")" = "1" ] && pass "seeded entry untouched" || fail "seeded entry untouched"

# 15. While a run holds its transaction, nobody can attach a new entry to a
#     scoped dog (the lock that stops an unrecorded row being cascaded away).
psql "$url" -X -q -v ON_ERROR_STOP=1 -f "$fixture" >/dev/null 2>&1
held="$(mktemp)"
sed 's/^ROLLBACK;$/SELECT pg_sleep(4);\nROLLBACK;/' "$script" >"$held"
psql "$url" -X -q -v token='2026-09-13 0305' -f "$held" >/dev/null 2>&1 &
holder=$!
sleep 1.5
blocked="$(psql "$url" -X -q -c "SET lock_timeout = '1s'; INSERT INTO entries VALUES ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', NULL, 'paid', 30)" 2>&1)"
wait "$holder"
rm -f "$held"
if grep -q 'lock timeout' <<<"$blocked"; then pass "a scoped dog is locked against new entries for the whole run"; else fail "scoped dog lock ($blocked)"; fi

# 15b. The parent-row lock above does NOT stop an UPDATE to an EXISTING
#      child row's own columns (no FK is touched). Prove the child's own lock
#      (Codex finding on this PR, entry_status_history specifically) blocks
#      an UPDATE to run A's existing history row while a run holds its
#      transaction, the same way case 15 proves it for a new entries INSERT.
psql "$url" -X -q -v ON_ERROR_STOP=1 -f "$fixture" >/dev/null 2>&1
held="$(mktemp)"
sed 's/^ROLLBACK;$/SELECT pg_sleep(4);\nROLLBACK;/' "$script" >"$held"
psql "$url" -X -q -v token='2026-09-13 0305' -f "$held" >/dev/null 2>&1 &
holder=$!
sleep 1.5
blocked="$(psql "$url" -X -q -c "SET lock_timeout = '1s'; UPDATE entry_status_history SET new_status = 'tampered' WHERE id = '00000000-0000-0000-0000-0000000000b1'" 2>&1)"
wait "$holder"
rm -f "$held"
if grep -q 'lock timeout' <<<"$blocked"; then
  pass "a scoped entry's history row is locked against edits for the whole run"
else
  fail "scoped history row lock ($blocked)"
fi

# 16-17. This script's own URL guard (Codex P2 on #2453, MYK9-734): a query
# string that sets host=/hostaddr= is refused before any statement runs, even
# though the visible host looks like localhost, because libpq honors that
# query key over the URL's own host. Re-invokes this file, not the fixture.
attack_out="$(WALK_RESIDUE_TEST_DB_URL='postgresql://postgres@localhost:5432/postgres?host=evil.example.com' bash "$0" 2>&1)"
attack_status=$?
if [ "$attack_status" -eq 2 ] && grep -q 'host=/hostaddr=' <<<"$attack_out"; then
  pass "a query-string host= override is refused before any statement runs"
else
  fail "query-string host= override refused (status=$attack_status)"; printf '%s\n' "$attack_out" | tail -3
fi

attack_out="$(WALK_RESIDUE_TEST_DB_URL='postgres://postgres@127.0.0.1/postgres?HOSTADDR=10.0.0.5' bash "$0" 2>&1)"
attack_status=$?
if [ "$attack_status" -eq 2 ] && grep -q 'host=/hostaddr=' <<<"$attack_out"; then
  pass "a query-string HOSTADDR= override is refused case-insensitively"
else
  fail "query-string HOSTADDR= override refused (status=$attack_status)"; printf '%s\n' "$attack_out" | tail -3
fi

# 18-19. libpq percent-decodes a query string before reading its keys, so
# `?%68ost=` and `?host%61ddr=` decode to host=/hostaddr= at connect time even
# though neither literal key appears in the URL text (Codex finding on this
# PR against the case 16-17 fix above). Any '%' in the query string refuses.
attack_out="$(WALK_RESIDUE_TEST_DB_URL='postgresql://postgres@localhost:5432/postgres?%68ost=evil.example.com' bash "$0" 2>&1)"
attack_status=$?
if [ "$attack_status" -eq 2 ] && grep -q 'percent-encoded character' <<<"$attack_out"; then
  pass "a percent-encoded host= (%68ost=) is refused before any statement runs"
else
  fail "percent-encoded host= refused (status=$attack_status)"; printf '%s\n' "$attack_out" | tail -3
fi

attack_out="$(WALK_RESIDUE_TEST_DB_URL='postgresql://postgres@localhost:5432/postgres?host%61ddr=evil.example.com' bash "$0" 2>&1)"
attack_status=$?
if [ "$attack_status" -eq 2 ] && grep -q 'percent-encoded character' <<<"$attack_out"; then
  pass "a percent-encoded hostaddr key (host%61ddr=) is refused"
else
  fail "percent-encoded hostaddr key refused (status=$attack_status)"; printf '%s\n' "$attack_out" | tail -3
fi

if [ "$failures" -eq 0 ]; then echo "walk-residue-cleanup-local: all cases passed"; exit 0; fi
echo "walk-residue-cleanup-local: $failures case(s) failed"; exit 1
