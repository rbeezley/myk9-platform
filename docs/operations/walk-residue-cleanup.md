# Walk residue cleanup

> **Status:** Reference

The exhibitor task walk pays for one entry per run with a throwaway dog, `ZZ Walk Dog <run token> #N`, because the moment after paying is the state it most needs to see. Nothing in the UI can remove that dog afterwards: `soft_delete_dog` refuses a dog holding a paid entry (`MK002`), and withdraw and refund are out of the walk's scope. So each paying run leaves, on `exhibitor@`:

- the dog (and its registrations),
- a paid entry and its `entry_status_history`,
- a sandbox `stripe_orders` row (and the sandbox Stripe objects, which stay in Stripe),
- possibly a checkout-created enrollment on the target show.

The dog count drifts (MYK9-545 was a CI sweep failing on 252 → 261 dogs), My Payments grows, and because the walk's target show (`Heartland UKC Nosework Trial`, `...011`) is one the reseed deletes, **a paid walk entry makes the next reseed abort on its money guard** (`seed-reset` skill, "When the seed aborts").

The reseed does not remove this residue (option 1 in MYK9-734 does not hold): it refuses to. The sink is [`supabase/ops/walk-residue-cleanup.sql`](../../supabase/ops/walk-residue-cleanup.sql), keyed on one run's exact token.

## Who runs it

An operator, against staging, never a walk. It hard-deletes a payment trail, which is a shared-system write; confirm it like a reseed. The walk's job is to name the token: its report carries a `WALK RESIDUE TOKEN <YYYY-MM-DD HHMM>` line with the paid dog's name and entry id.

## Record, then apply

Two runs, never one. The second deletes only the exact state the first printed.

```bash
# From a checkout that can reach staging (see staging-reseed.md for the URL and password).
export PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' supabase/.env | cut -d= -f2-)"
URL="$(cat supabase/.temp/pooler-url)"
TOKEN='2026-09-13 0305'

# 1. RECORD. Deletes nothing. Save the output.
mkdir -p docs/audits/walk-residue
psql "$URL" -X -v ON_ERROR_STOP=1 -v token="$TOKEN" \
  -f supabase/ops/walk-residue-cleanup.sql > "docs/audits/walk-residue/$TOKEN.txt"
tail -3 "docs/audits/walk-residue/$TOKEN.txt"   # RECORD SHA256 <hex>, then RECORD ONLY
```

2. **Read the record.** It lists every dog, registration, entry, status-history row, order, enrollment, cart line, waitlist row and armband the apply would remove, in full. Check that every order is `cs_test_` and that nothing in it belongs to a seeded fixture. Commit the file (docs-only, direct to `main` is fine). This is the recorded step: once the apply runs, the file is the only copy of those rows.

```bash
# 3. APPLY, with the SHA the record printed.
psql "$URL" -X -v ON_ERROR_STOP=1 -v token="$TOKEN" -v apply_sha=<hex> \
  -f supabase/ops/walk-residue-cleanup.sql
```

Both runs lock the scoped dogs, entries, orders and enrollments first, and hold the locks until they end, so no other session can attach a new entry or history row to them while the record is built and applied. A writer that tries simply waits. The apply rebuilds the record from the database and refuses unless its hash equals `apply_sha`, so anything that changed after the record (a refund landed, a row was edited) stops it. Record again, review again, then apply.

Afterwards the account is back to its baseline for that run: `select count(*) from dogs d join people p on p.id = d.owner_id where lower(p.email) = 'exhibitor@myk9t.com' and d.name like 'ZZ Walk Dog %'` drops by that run's dogs, and nothing seeded changes, so specs that pin `exhibitor@`'s seeded counts are unaffected.

## What it refuses

Every refusal rolls back with nothing deleted:

- a token that is not exactly `YYYY-MM-DD HHMM` (a date alone, a prefix or a pattern), or one that matches no dog. Only dogs owned by `exhibitor@` or `exhibitor2@` and named exactly `ZZ Walk Dog <token> #<n>` are in scope, so one run's cleanup never reaches another run's rows;
- an order that also paid for an entry outside that run's scope, since a mixed order is not walk residue;
- an order with a `stripe_order_refunds` row (refund facts are permanent ledger history) or a `cs_live_` Checkout session;
- any other table whose foreign key into the dogs, entries, enrollments or orders it deletes would cascade or set null, if that table holds a row for them. The script reads those constraints from `pg_constraint` at run time, so a table added later is refused, named, until the script records it too. A `NO ACTION` / `RESTRICT` reference it does not clear fails the delete itself inside the same transaction.

An enrollment is removed only when nothing outside the run still points at it. The walk account's enrollment on a show is unique per (show, handler), so it can carry several runs' entries and stays until the last of them is cleaned.

## Testing it

`scripts/qa/walk-residue-cleanup-local.sh` runs the script against a throwaway local Postgres and a stub of the tables it touches (`scripts/qa/walk-residue-cleanup-local-fixture.sql`). It refuses any non-localhost URL, because the fixture drops schema `public`:

```bash
WALK_RESIDUE_TEST_DB_URL=postgresql://postgres@localhost:<port>/postgres \
  bash scripts/qa/walk-residue-cleanup-local.sh
```

It proves the script's scoping, refusals and record/apply handshake. It cannot prove the live catalog has no other reference; the run-time `pg_constraint` survey is what covers that on staging.
