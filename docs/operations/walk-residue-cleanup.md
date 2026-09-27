# Walk residue cleanup

> **Status:** Reference

**Since 2026-09-26 the exhibitor task walk stops at the Stripe Checkout boundary and never presses Pay** (`docs/qa/walks/exhibitor-task-walk.md` Part 1, owner decision). Because an entry is created only by the Stripe webhook after payment, a walk run no longer pays and no longer leaves a paid entry, a `stripe_orders` row or a checkout-created enrollment by default. What it still leaves, on `exhibitor@` and `exhibitor2@`:

- the throwaway dog (`ZZ Walk Dog <run token> #N`) and its registrations,
- any cart line the run added.

Nothing in the UI can remove that dog today: **not because it holds a paid entry** (it doesn't, by design) but because of a separate bug, MYK9-799 (the delete dialog's pre-check 403s for every dog). The walk records this residue with a `WALK RESIDUE TOKEN <token>` line in its report rather than deleting it itself, per the walk's safe-mutation boundary.

This script is still the sink for two things: (1) the paid residue three earlier runs left before the stop-at-checkout change (a dog, a paid entry, its `entry_status_history`, a sandbox `stripe_orders` row and possibly an enrollment), still sitting on staging, and (2) any future run that reaches Checkout and completes a payment by mistake. It handles plain unpaid dog/cart residue the same way — the entry, order and enrollment tables are simply empty for a token that never paid.

The dog count drifts (MYK9-545 was a CI sweep failing on 252 → 261 dogs), and because the walk's target show (`Heartland UKC Nosework Trial`, `...011`) is one the reseed deletes, **a paid walk entry makes the next reseed abort on its money guard** (`seed-reset` skill, "When the seed aborts").

The reseed does not remove this residue (option 1 in MYK9-734 does not hold): it refuses to. The sink is [`supabase/ops/walk-residue-cleanup.sql`](../../supabase/ops/walk-residue-cleanup.sql), keyed on one run's exact token.

## Who runs it

An operator, against staging, never a walk. It can hard-delete a payment trail, which is a shared-system write; confirm it like a reseed. The walk's job is to name the token: its report carries a `WALK RESIDUE TOKEN <YYYY-MM-DD HHMM>` line with the residue dog's name and id (and, for a legacy paying run, its entry id).

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

2. **Read the record.** It lists every dog, registration, entry, status-history row, order, enrollment, cart line, waitlist row and armband the apply would remove, in full. The script itself already refused if any order's Checkout session isn't a verified `cs_test_` one, but re-read the JSON anyway and check that nothing in it belongs to a seeded fixture. Commit the file (docs-only, direct to `main` is fine). This is the recorded step: once the apply runs, the file is the only copy of those rows.

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
- an order with a `stripe_order_refunds` row (refund facts are permanent ledger history), or whose Checkout session id is not a verified sandbox (`cs_test_`) one — a positive requirement, not just a `cs_live_` blocklist, so a null or malformed session id refuses the same as a live one;
- any other table whose foreign key into the dogs, entries, enrollments or orders it deletes would cascade or set null, if that table holds a row for them. The script reads those constraints from `pg_constraint` at run time, so a table added later is refused, named, until the script records it too. A `NO ACTION` / `RESTRICT` reference it does not clear fails the delete itself inside the same transaction;
- any foreign key into the dogs, entries, enrollments or orders it deletes that is composite (more than one column). Composite foreign keys are unsupported by this script (owner decision, MYK9-734): the survey above only ever inspects the constraint's first column, so a multi-column foreign key would otherwise pass unseen. This is a hard refusal, named by constraint and table, not something the script infers support for on its own — extending it for a specific composite FK is a deliberate by-hand change.

An enrollment is removed only when nothing outside the run still points at it. The walk account's enrollment on a show is unique per (show, handler), so it can carry several runs' entries and stays until the last of them is cleaned.

## Testing it

`scripts/qa/walk-residue-cleanup-local.sh` runs the script against a throwaway local Postgres and a stub of the tables it touches (`scripts/qa/walk-residue-cleanup-local-fixture.sql`). It refuses any non-localhost URL, because the fixture drops schema `public` — including a URL whose query string sets `host=`/`hostaddr=`, which libpq honors over the URL's own host and would otherwise let a URL that merely _looks_ like `localhost` reach a real database (Codex P2 on #2453):

```bash
WALK_RESIDUE_TEST_DB_URL=postgresql://postgres@localhost:<port>/postgres \
  bash scripts/qa/walk-residue-cleanup-local.sh
```

It proves the script's scoping, refusals and record/apply handshake. It cannot prove the live catalog has no other reference; the run-time `pg_constraint` survey is what covers that on staging.

## Accepted residual race

The apply step's last check refuses when an order created after the record names one of the run's entries. An order inserted after that check but before `COMMIT` is not seen, because `stripe_orders.entry_ids` has no foreign key for a row lock to hold. Closing that window would need a table lock on `stripe_orders` for the whole apply, which blocks every checkout on the shared database.

Richard accepted the race on 2026-09-25 (Codex P2 on #2453). The script is operator-run, it scopes only walk-only dogs, the window is a few statements long, and a walk's own orders come from that walk, which has finished before anyone records it. Don't run apply while a walk is in progress.
