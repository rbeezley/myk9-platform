#!/usr/bin/env bash
# Prove the real settlement and capacity RPCs contend on the same show lock.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_URL="${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}"
LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if [[ "$DATABASE_URL" != "$LOCAL_DATABASE_URL" ]]; then
  echo 'FAIL: concurrency SQL test requires the exact local loopback database URL.' >&2
  exit 1
fi
command -v psql >/dev/null || { echo 'FAIL: psql is required.' >&2; exit 1; }

scratch="$(mktemp -d)"
owned_pids=()
cleanup() {
  for release_file in "$scratch"/release-*; do
    [[ -e "$release_file" ]] && touch "$release_file"
  done
  for pid in "${owned_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      for _ in {1..100}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.02
      done
      kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  done
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fixture="$REPO_ROOT/supabase/tests/authoritative_entry_settlement_test.sql"
setup_begin='-- MYK9-639-RACE-SETUP-BEGIN: the concurrency runner reuses this fixture setup.'
setup_end='-- MYK9-639-RACE-SETUP-END'
[[ "$(rg -F -c "$setup_begin" "$fixture")" == 1 && "$(rg -F -c "$setup_end" "$fixture")" == 1 ]] || {
  echo 'FAIL: settlement fixture setup sentinels are missing or duplicated.' >&2; exit 1;
}
awk -v start="$setup_begin" -v end="$setup_end" '
  $0 == start { if (started) exit 2; started=1; print "BEGIN;"; next }
  $0 == end { if (!started) exit 3; finished=1; print "COMMIT;"; exit }
  started { print }
  END { if (!started || !finished) exit 4 }
' "$fixture" > "$scratch/setup.sql"
for required in 'INSERT INTO public.entry_carts' 'INSERT INTO public.entry_cart_items' 'SET LOCAL ROLE service_role'; do
  rg -Fq "$required" "$scratch/setup.sql" || {
    echo "FAIL: extracted settlement setup is incomplete (missing $required)." >&2; exit 1;
  }
done

run_order() {
  local ids="$1" first="$2"
  local suffix="000000${ids}"
  local show="00000000-0000-0000-0000-${suffix}702"
  local cart="00000000-0000-0000-0000-${suffix}724"
  local dog="00000000-0000-0000-0000-${suffix}760"
  local class="00000000-0000-0000-0000-${suffix}716"
  local trial="00000000-0000-0000-0000-${suffix}703"
  local exhibitor="00000000-0000-0000-0000-${suffix}723"
  local session="cs_${ids}_mixed_cart" pi="pi_${ids}_mixed_cart"
  local lock_key="showcapacity:${show}"
  local release_file="$scratch/release-$ids" ready_file="$scratch/ready-$ids"
  local first_kind second_kind first_file second_file first_app second_app first_rpc second_rpc

  if [[ "$(psql "$DATABASE_URL" -X -Atc "SELECT EXISTS (SELECT 1 FROM public.shows WHERE id = '$show');")" != f ]]; then
    echo "FAIL: fixture show $show already exists; concurrency runner requires a freshly reset local database." >&2
    return 1
  fi
  sed "s/639/${ids}/g" "$scratch/setup.sql" | PGOPTIONS='-c statement_timeout=15000' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null

  cat > "$scratch/settlement.sql" <<SQL
SELECT * FROM public.settle_entry_order(
  'cart', '$cart',
  '{"customer_id":null,"currency":"usd","paid_at":"2026-09-22T12:00:00Z","stripe_processing_fee_cents":50,"platform_fee_rate":7,"platform_fee_flat_cents":0,"platform_fee_min_cents":0}'::jsonb,
  14980, '$session', '$pi',
  '[{"lineId":"00000000-0000-0000-0000-${suffix}725","priceCents":3500},{"lineId":"00000000-0000-0000-0000-${suffix}726","priceCents":3500},{"lineId":"00000000-0000-0000-0000-${suffix}727","priceCents":3500},{"lineId":"00000000-0000-0000-0000-${suffix}728","priceCents":3500}]'::jsonb);
SQL
  cat > "$scratch/capacity.sql" <<SQL
SELECT * FROM public.create_online_paid_entry(
  '$dog', '$class', NULL, 35, NULL, NULL, 'pi_${ids}_capacity', now(),
  '$show', '$trial', '$exhibitor');
SQL
  if [[ "$first" == settlement ]]; then
    first_kind=settlement; second_kind=capacity
  else
    first_kind=capacity; second_kind=settlement
  fi
  first_file="$scratch/$first_kind.sql"; second_file="$scratch/$second_kind.sql"
  first_app="myk9_${ids}_${first_kind}"; second_app="myk9_${ids}_${second_kind}"
  first_rpc="$first_kind"; second_rpc="$second_kind"
  if [[ "$first_kind" == settlement ]]; then first_rpc=settle_entry_order; else first_rpc=create_online_paid_entry; fi
  if [[ "$second_kind" == settlement ]]; then second_rpc=settle_entry_order; else second_rpc=create_online_paid_entry; fi

  {
    echo 'BEGIN;'
    echo 'SET LOCAL ROLE service_role;'
    cat "$first_file"
    printf "\\! touch '%s'; while [ ! -e '%s' ]; do sleep 0.02; done\n" "$ready_file" "$release_file"
    echo 'COMMIT;'
  } > "$scratch/first-session.sql"
  { echo 'BEGIN;'; echo 'SET LOCAL ROLE service_role;'; cat "$second_file"; echo 'COMMIT;'; } > "$scratch/second-session.sql"

  PGAPPNAME="$first_app" PGOPTIONS='-c statement_timeout=15000' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$scratch/first-session.sql" >"$scratch/first.log" 2>&1 &
  local first_pid=$!
  owned_pids+=("$first_pid")
  local ready=false
  for _ in {1..150}; do
    if [[ -e "$ready_file" ]]; then ready=true; break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
    sleep 0.02
  done
  if [[ "$ready" != true ]]; then
    touch "$release_file"; wait "$first_pid" || true
    cat "$scratch/first.log" >&2
    echo "FAIL: first $first_kind RPC did not finish while retaining its transaction." >&2
    return 1
  fi

  # The real RPC has returned, its transaction remains open, and its backend
  # still owns an advisory lock. No test-injected advisory lock is acquired.
  if ! psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_locks l
      JOIN pg_catalog.pg_stat_activity a ON a.pid = l.pid
       WHERE a.application_name = '$first_app' AND a.state = 'idle in transaction'
         AND a.query ILIKE '%$first_rpc%' AND l.locktype = 'advisory' AND l.granted
         AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
         AND l.classid::bigint = ((pg_catalog.hashtext('$lock_key')::bigint >> 32) & 4294967295)
         AND l.objid::bigint = (pg_catalog.hashtext('$lock_key')::bigint & 4294967295)
         AND l.objsubid = 1
    );" | rg -qx t; then
    touch "$release_file"; wait "$first_pid" || true
    echo "FAIL: pg_locks did not show the completed $first_kind RPC retaining an advisory transaction lock." >&2
    return 1
  fi

  PGAPPNAME="$second_app" PGOPTIONS='-c statement_timeout=15000' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$scratch/second-session.sql" >"$scratch/second.log" 2>&1 &
  local second_pid=$!
  owned_pids+=("$second_pid")
  local observed_graph=false
  for _ in {1..150}; do
    if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
      WITH first_backend AS (
        SELECT pid FROM pg_catalog.pg_stat_activity
         WHERE application_name = '$first_app' AND state = 'idle in transaction'
           AND query ILIKE '%$first_rpc%'
      ), second_backend AS (
        SELECT pid FROM pg_catalog.pg_stat_activity
         WHERE application_name = '$second_app' AND state = 'active'
           AND query ILIKE '%$second_rpc%'
      )
      SELECT EXISTS (
        SELECT 1
          FROM first_backend f
          JOIN pg_catalog.pg_locks owner
            ON owner.pid = f.pid AND owner.locktype = 'advisory' AND owner.granted
          JOIN second_backend s ON true
          JOIN pg_catalog.pg_locks waiter
            ON waiter.pid = s.pid AND waiter.locktype = 'advisory' AND NOT waiter.granted
           AND waiter.database IS NOT DISTINCT FROM owner.database
           AND waiter.classid = owner.classid
           AND waiter.objid = owner.objid
           AND waiter.objsubid = owner.objsubid
         WHERE f.pid = ANY(pg_catalog.pg_blocking_pids(s.pid))
           AND owner.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
           AND owner.classid::bigint = ((pg_catalog.hashtext('$lock_key')::bigint >> 32) & 4294967295)
           AND owner.objid::bigint = (pg_catalog.hashtext('$lock_key')::bigint & 4294967295)
           AND owner.objsubid = 1
           AND waiter.database = owner.database
           AND waiter.classid = owner.classid
           AND waiter.objid = owner.objid
           AND waiter.objsubid = owner.objsubid
      );" 2>/dev/null | rg -qx t; then
      observed_graph=true
      break
    fi
    if ! kill -0 "$second_pid" 2>/dev/null; then break; fi
    sleep 0.02
  done
  touch "$release_file"
  local failed=0
  wait "$first_pid" || failed=1
  wait "$second_pid" || failed=1
  if [[ "$observed_graph" != true ]]; then
    cat "$scratch/first.log" "$scratch/second.log" >&2
    echo "FAIL: pg_locks did not show $second_kind waiting on the same advisory lock held by $first_kind, with pg_blocking_pids naming its backend." >&2
    return 1
  fi
  if (( failed )); then cat "$scratch/first.log" "$scratch/second.log" >&2; return 1; fi
  if rg -n '40P01|deadlock detected' "$scratch/first.log" "$scratch/second.log"; then
    echo "FAIL: deadlock in ${first}-first race." >&2; return 1
  fi

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
    DO \$\$ DECLARE n integer; BEGIN
      SELECT count(*) INTO n FROM public.stripe_orders
       WHERE stripe_checkout_session_id = '$session' AND stripe_payment_intent_id = '$pi'
         AND status = 'succeeded' AND order_type = 'entry'
         AND entry_ids @> ARRAY['00000000-0000-0000-0000-${suffix}715'::uuid];
      IF n <> 1 THEN RAISE EXCEPTION 'expected one canonical order containing the live cart entry, found %', n; END IF;
      IF (SELECT stripe_payment_intent_id FROM public.entries
           WHERE id = '00000000-0000-0000-0000-${suffix}715') IS DISTINCT FROM '$pi' THEN
        RAISE EXCEPTION 'canonical cart root was not stamped with its PaymentIntent';
      END IF;
    END \$\$;" >/dev/null
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SET ROLE service_role; $(cat "$scratch/settlement.sql")" >/dev/null
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
    DO \$\$ DECLARE n integer; BEGIN
      SELECT count(*) INTO n FROM public.stripe_orders
       WHERE stripe_checkout_session_id = '$session' AND stripe_payment_intent_id = '$pi';
      IF n <> 1 THEN RAISE EXCEPTION 'same-session retry created a duplicate order'; END IF;
    END \$\$;" >/dev/null
  echo "PASS ${first}-first race: RPC transaction lock graph observed, both calls completed, retry reused order"
}

run_order 638 settlement
run_order 639 capacity
