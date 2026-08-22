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

## Phase 4 — cron triggers

Entry close and the evening before each trial day. Reuse
`push-trigger-show-eve`'s claim/lease/CAS so re-runs are idempotent and two
workers cannot double-send. Idempotency key is (show, trial date).

**Testing:** replay a trigger and assert no second packet and no second email;
assert a failed generation surfaces in `delivery_status` / `error_message`
rather than failing silently.

## Phase 5 — the reminder means "print it" ✅ (pending deploy)

Email to the show officials, evening before and morning of, firing only while
`paperwork_prints` holds no confirmation covering that trial day.

**5a — the day had to become addressable first.** Building the reminder
surfaced that its exit condition was not answerable, and that the same gap was
already mislabelling the UI. The packet is one artifact per trial DAY, but
`ReportScope` has no 'day' kind and cannot get one (a day may hold three
trials; a trial scope carries one id), so every confirmation writes
`scope_kind='show'` with a null `trial_id`. Two consequences:

- `scopeCovers` made Saturday's confirmation a candidate for Sunday's
  descriptor. Keyed by snapshot id the fingerprints differed, so Sunday read
  **stale** — "you printed an older version" — when nobody had printed Sunday
  at all. That is the difference between *reprint* and *print*, shown to
  someone deciding whether to walk to the printer.
- A snapshot UUID is unjoinable from SQL, so no server-side reminder could ask
  the question.

Fixed by making the day first-class: subject key `packet-day:<date>`, and
`coverage.trialDate` participating in candidate selection. `snapshotId` stays in
the facts, so regenerating the SAME day still reads stale — the distinction the
old key was conflating. Narrow: only descriptors declaring a `trialDate` are
affected, and every other report keeps its behaviour.

**5b — the reminder.** Email rather than push: it reuses the recipient
resolution phase 3 extracted, reaching the same officials who got the packet,
and the database holds exactly **one** push subscription, so push would reach
nobody. Two slots at 01:00 and 12:00 UTC, both targeting `current_date`, kept
as separate rows so a sent evening reminder cannot suppress the morning one —
which is the last moment paper can reach the box. A failed send releases the
claim rather than burning the slot.

It stays quiet when there is no packet. A reminder to print something that does
not exist is noise, and noise is how a channel stops being read; a generation
failure is a different problem with its own visibility.

**Testing.** 12 pure tests over the decision and the wording, 8 over the run
(both mutation-checked — removing the packet check, the printed check, the
claim, or the release each turns tests red), 9 over the migration, and 5 over
the cross-day confirmation behaviour in `paperworkPrintState`.

**Still open:** deploy, and the shared `packet_cron_secret`.

## The trap this plan exists to avoid

A packet that reliably appears in Storage every night is worth nothing on a
laptop that will not boot. Any readiness indicator must read `paperwork_prints`,
not the snapshot row — measuring packet existence would show green while the
actual failure mode stayed wide open.

## Not in scope

Ring assignment (MYK9-227, parked until a ring-using sport ships) and the human
mock-trial-day run, which is MYK9-198's own acceptance criterion.
