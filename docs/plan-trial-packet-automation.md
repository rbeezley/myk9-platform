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

## Phase 3 — `generate-trial-packet` edge function ✅ (pending deploy)

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

**Verified so far:** `deno check` clean on the function's whole import graph,
and the renderer producing real per-day PDFs under Deno with `npm:jspdf@4.2.1`
— 12 pages each, correct snapshot markers, per-day scoping, and the MYK9-198
time limits. **Still open:** one scratch deploy to confirm the Supabase edge
runtime behaves like the Deno CLI. That is the residual risk the spike could
not close without Docker; verify by grepping the live bundle, never by the
deploy timestamp.

## Phase 4 — cron triggers

Entry close and the evening before each trial day. Reuse
`push-trigger-show-eve`'s claim/lease/CAS so re-runs are idempotent and two
workers cannot double-send. Idempotency key is (show, trial date).

**Testing:** replay a trigger and assert no second packet and no second email;
assert a failed generation surfaces in `delivery_status` / `error_message`
rather than failing silently.

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
