# Trial packet automation (MYK9-228)

> **Status:** Active

Make the emergency trial packet exist without anyone remembering to make it.

The full problem statement, the spike evidence, and the design rationale live in
**[MYK9-228](https://linear.app/myk9-platform/issue/MYK9-228)**. This file is the
build sequence only — it does not restate the issue.

## Why this is staged

Each phase below is independently mergeable and independently useful. The last
phase is the one that closes MYK9-198's headline criterion, but shipping the
earlier ones first means the automation generates the _right_ artifact rather
than automating today's wrong one.

## Phase 1 — the packet unit becomes a trial day ✅

The packet is whole-show today. With a nightly trigger that means reprinting
every page every evening, including the previous day's spent pages — the exact
"two near-identical stacks" confusion the packet's own recovery page warns
about. Split the input by trial date and emit one packet per day, keeping the
per-trial sections (and their per-registry certification pages) inside.

- `splitPacketInputByTrialDay` partitions the input; the model builder is
  reused unchanged, so per-day packets cannot drift from whole-show ones.
- The cover names the day and lists the trials in that day's packet.
- The filename carries the trial date so two days' packets are distinguishable
  on a desktop full of downloads.
- The Reports panel prepares and delivers one packet per day.

**Testing:** pure partition tests (multi-trial days, single-trial days, entries
reachable by `classId` and by `trialId`); rendered-PDF assertions that a day's
packet contains only that day's trials; panel tests for the multi-packet flow.

## Phase 2 — share the renderer with Deno ✅

Move the model builder and PDF renderer somewhere both the app and an edge
function import. The spike measured the gap at three import lines. Wrap the
jsPDF import so the named-vs-default difference (`import { jsPDF }` under Deno's
npm interop) lives in one adapter rather than in two copies of the file.

**Testing:** the existing packet suite must pass unchanged against the moved
module — the point is that there is exactly one implementation.

**Done.** The module was decoupled in place rather than relocated: the jsPDF
constructor is injected, the entry shape is declared locally, and the seconds
formatter is mirrored with a contract test pinning it to `@myk9/core`. Proof is that the three source files pass `deno check` AND run under Deno
**byte-identical to the app's copies** — the spike needed three edits, this
needs none. `deno check` is the load-bearing half: `deno run` does not type
check by default in Deno 2, so a bare `import type ... from 'jspdf'` passed at
runtime and failed the check, which is why the PDF surface is declared
structurally rather than imported. Relocation can wait for the
edge function in Phase 3, where a real deploy verifies it.

## Phase 3 — `generate-trial-packet` edge function ✅

Query → model → PDF → upload to `trial-packets` → deliver.

**One thing this plan had wrong.** It said `deliver-trial-packet` "needs no
changes". It did: that handler required a user JWT and wrote `generated_by`
from it, neither of which a cron run has. The delivery step moved to
`_shared/trialPacket/deliverStoredPacket.ts` and both functions call it — the
manual path proves the right to act with a show manager's JWT, the automated
one with a bearer secret, and everything after that is one implementation.

Shipped in three pieces:

- **3a** (#1738) — `emergency_packet_input(show, day?)`, the SECURITY DEFINER
  source of truth for the packet's input shape. Applied to the linked project.
- **3b-1** (#1743) — the delivery extraction above.
- **3b-2** — `generate-trial-packet` itself, plus the schema the automation
  needs: `generated_by` nullable, and `trial_date` / `generated_source`
  columns, because the trigger's idempotency key is (show, trial date) and
  nothing recorded the day.

The renderer moved to `_shared/trialPacket/renderer/` rather than being copied:
the app imports the same files through a re-export shim. Phase 2 left this open
("relocation can wait for the edge function in Phase 3") — it turned out the
app's Vite build and `tsc` both follow a relative import out of `apps/myk9show`
without any config change, so there is exactly one renderer.

**Verified.** `deno check` clean on the function's whole import graph, and the
renderer producing real per-day PDFs under Deno with `npm:jspdf@4.2.1` — 12
pages each, correct snapshot markers, per-day scoping, and the MYK9-198 time
limits.

**Deployed 2026-08-22**, and the residual risk the spike could not close
without Docker is now closed with it: the Supabase edge runtime loads the whole
graph, `npm:jspdf` included. Proof is a live call returning
`503 {"error":"Trigger is not configured"}` — that body exists only in
`requireFunctionSecret`, and reaching it means every top-level import resolved,
since `Deno.serve` is registered after them. A boot failure answers with
`BOOT_ERROR` instead. Migration `20260821230000` applied the same day; columns,
both CHECKs, and the index verified against the database rather than the file.

What is still NOT demonstrated: a full generate run **inside** that runtime.
jsPDF imports there; whether it renders there is very likely but untested,
because proving it needs `PACKET_CRON_SECRET` set and a real invocation, and a
real invocation emails show officials. Phase 4 sets the secret and is the
natural place to take that last step — against a scratch show, not a live one.

## Phase 4 — cron trigger ✅ (pending deploy)

The evening before each trial day, `pg_cron` enumerates tomorrow's (show, day)
pairs and asks `generate-trial-packet` for one packet each.

**Singular, not the two triggers this plan and the issue both named.** Entry
close was dropped deliberately. The acceptance criterion is that re-running a
trigger produces no second packet or second email for the same trial day, and
the key is (show, trial date) — so an entry-close packet would make the
evening run a **no-op**, and the paper reaching the trial box would be the
OLDER of the two, missing exactly the movements and pulls the evening run
exists to capture. The alternative, keying per trigger, means two packets and
two emails per day: the "two near-identical stacks" confusion the packet's own
Paper Results Recovery page warns about. One evening, one print, one artifact.

Worth recording because it nearly went the other way: the case against an
entry-close packet was going to be "it has no armbands yet", and that is
**false**. `assign_armband` runs at registration, not in a batch after close —
on Heartland all 69 dogs hold armbands and 512 of 514 entries have a run order.
An entry-close packet would have been perfectly usable. The reason to drop it
is duplication, not incompleteness.

- `trial_packet_generation_claims` — one row per (show, trial day), unique.
  `completed_at` separates a finished run from one that died mid-render, so a
  crash costs one cycle instead of suppressing the day permanently. Lease is
  10 minutes: above the worst-case render, below the 30-minute cron gap.
- Claim → generate → complete, with a CAS reclaim on the stale path. A failure
  releases the claim so a later run in the same evening retries.
- A packet the secretary made by hand still counts. The manual path writes no
  claim, so the sent-snapshot check is the only thing that sees it, and it
  completes the claim rather than releasing it.
- `in-flight` is reported separately from `already-delivered` — collapsing them
  would make a permanently stuck run look like a success.

**Testing.** 23 unit tests over the generation path, including take-over of a
dead run's claim and release-on-failure, all mutation-checked: removing the
lease check, the release, or the completion each turns tests red. 9 contract
tests over the migration.

**Still open:** deploy, plus the Vault secret `packet_cron_secret` and the
matching `PACKET_CRON_SECRET` function secret. Until both exist the function
answers 503 and the cron raises rather than posting unauthenticated requests.

**Known gap, matching show-eve's.** Timezone precision. The window is
21:00–23:59 UTC so `current_date + 1` names one date all evening, but for a
show far east of UTC that "evening" is already the trial morning. A packet that
lands early still does its job; one on the wrong DATE would not, which is what
the single-UTC-day window prevents.

## Phase 5 — the reminder means "print it"

Automation can generate and email; it cannot put paper in a box. The reminder
stops asking for a packet and starts asking for a print, firing only when
`paperwork_prints` holds no confirmation covering that trial day.

**Testing:** fires with no confirmation, stops once one exists, and does not
fire for a day with no trials.

## The trap this plan exists to avoid

A packet that reliably appears in Storage every night is worth nothing on a
laptop that will not boot. Any readiness indicator must read `paperwork_prints`,
not the snapshot row — measuring packet existence would show green while the
actual failure mode stayed wide open.

## Not in scope

Ring assignment (MYK9-227, parked until a ring-using sport ships) and the human
mock-trial-day run, which is MYK9-198's own acceptance criterion.
