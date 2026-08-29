# Secretary Task Walk — Remediation

> **Status:** Active

Closes the findings from [`audits/2026-08-28-secretary-task-walk.md`](audits/2026-08-28-secretary-task-walk.md),
a live browser walk of all 20 common secretary tasks. 33 findings; 7 are fixed and
merged (#1853). This plan covers the remainder.

**F29 correction (2026-08-29).** An eighth fix was reverted before merge. I had changed
`ShowDetailTabs` to forward `canManageShow` to the Show Map, overruling a test that said
otherwise; #291 decided that read-only property deliberately and the collapse plan lists
"view-only public map" as an architectural commitment. The premise was wrong too -- the
row actions live on Show Desk's cockpit (`getRankedActions`), so the change duplicated an
existing surface rather than unlocking a missing one. One half survives as **F29b** and is
real: run order has no reachable home anywhere. It is a Phase 2 judgment call, not a
mechanical fix -- added as 2.8 below.

## How this plan is grouped, and why

The remaining findings are **not** uniform work. Three of them need a decision that is
not mine to make, and about five look mechanical but are actually product intent. That
distinction is the point of the grouping — during the walk I twice changed something
that looked like drift and was not (the Show Map read-only test, `manageable_show_ids`'
missing predicate is the standing precedent), and once nearly did.

Phase 1 is safe to run unattended. Phases 2 and 3 are not.

**Phase 1 COMPLETE (2026-08-29): all 15 done.** Two new findings came out of the work — **F34** (id-keyed Selects render raw
UUIDs app-wide, 43 sites) and **F35** (a local time exactly on UTC midnight resolves a
day late) — both recorded in the audit and deferred to Phase 3 rather than swept in
here.

---

## Phase 1 — Mechanical fixes (safe to batch)

Each is a contained change with an observable before/after. No product decision.

| # | Finding | Change |
| --- | --- | --- |
| 1.1 | F9 | "1 classes" → singular form on the Detective element — **DONE** — shared `utils/pluralize` (extracted the only existing copy) |
| 1.2 | F13 | Judge option renders `Test Judge( - )`; drop the empty separator/parens — **DONE** — `formatJudgeAvailabilityWindow`, both call sites |
| 1.3 | F17 | Secretary entry wizard's Help link points at the exhibitor guide — **DONE** — follows `currentWorkflowMode` |
| 1.4 | F28 | Manage Classes shows the judge's raw UUID instead of their name — **DONE**; root cause is Base UI needing `items` on the Select root, which turned out to be systemic (see **F34**, Phase 3) |
| 1.5 | F20 | Waitlist capacity cards title a judge-day with a bare person name — **DONE** — labelled as a judge; entry count pluralized |
| 1.6 | F32 | Volunteers empty state names a sidebar picker that does not exist — **DONE** — names the Show Desk path that works, links to the shows list |
| 1.7 | F5 | "Judges Assigned n/n" counts judges used/added, not classes covered — **DONE** — tile now counts classes covered, not judges used (mutation-checked) |
| 1.8 | F19 | Filter chips expose no pressed state (Entry Management queues, Show Map filters); Manage Classes already does it correctly — copy that — **DONE** — 4 filter groups (3 Show Map + Entry Management queues), mutation-checked |
| 1.9 | F7 | Judge/chairman picker rows are bare `<div>`s: no option/listitem role, name not a leaf node — **DONE (residual only)** — #1845 had already added the list roles the same day; added the missing `aria-selected` |
| 1.10 | F27 | Cold replication store reports "Class not found" for a class that exists — **DONE** — hydrates trials+classes via replication, then re-reads, before reporting absence |
| 1.11 | F31 | `classifyEmptyUpdateResult` calls an unreadable row a deleted one; the re-read is filtered by the same policy that denied the write — **DONE** — no longer asserts deletion for an unreadable row |
| 1.12 | F6 | Entry-close picker defaults to 11:59 PM, so choosing the show's own start date is always invalid — **DONE** — `toLocalDateOnly`; tested across 6 timezones; surfaced **F35** |
| 1.13 | F2 | `.env.local` `E2E_SECRETARY_EMAIL` points at a deleted account, breaking every local secretary e2e run — **DONE** — canonical `@myk9t.com` defaults in `testUsers.ts` (audit was wrong: the default was `''`, not the named account) |
| 1.14 | F10 | Playwright `error-context.md` captures the password field's value in plaintext — **DONE** — `globalTeardown` scrubs secrets from artifacts; pure half in `src/utils` so vitest actually runs it |
| 1.15 | F11 | Root `playwright.config.ts` cannot load from a worktree (`@playwright/test` undeclared at root) — **DONE** — root declares `@playwright/test` |

**Testing (Phase 1):** each fix needs a test that fails without it. Prefer rendered
behaviour over source strings — `dropdownMenuOverflow.test.ts` is the standing example
of a source-grep test certifying a no-op. 1.9, 1.11 and 1.15 have natural unit seams;
1.1–1.8 are component assertions; 1.13–1.15 are developer-experience and verified by
running the thing they unblock.

---

## Phase 2 — Needs a product decision first

Do not start these until the question is answered. Each is a plausible-looking defect
that may be a deliberate choice.

| # | Finding | The question |
| --- | --- | --- |
| 2.1 | **F30** (P1) | **DECIDED 2026-08-29 — see Phase 2A.** |
| 2.2 | **F26** (P1) | **DECIDED 2026-08-29 — rules read, see Phase 2B.** |
| 2.3 | F3 | Escape anywhere in the creation wizard raises "Unsaved Changes — leave the wizard?". Is that intended, or should Escape only dismiss the focused popover? |
| 2.4 | F8 | The Show Chairman picker lists every person on the platform. Should it be club-scoped, or is cross-club chairman selection legitimate? |
| 2.5 | F22 / F23 | `/secretary/messages` is history-only and composing lives in a header panel that does not inherit the show you opened it from. Should Messages gain a composer, or should the panel be the only entry point and Messages link to it? |
| 2.6 | F18 | Every paid entry displays "Paid online" because `mapPaymentStatus` maps the generic `'paid'` onto `PAID_ONLINE`. Should the label read `entries.payment_method`, or should the status enum carry the channel? |
| 2.8 | **F29b** (P2) | Run order is unreachable: `ShowMapRunOrderMenu`/`reorderMode` render only inside `ShowMapTab` (correctly read-only), the cockpit action catalog has no reorder command, and Manage Classes -- where Show Desk's "Run order and class setup" link lands -- has no run-order control. Should reorder become a cockpit action, or a control on Manage Classes where the deep link already points? |
| 2.7 | F24 | Other clubs' show names appear in the Communication History filter. Names and existence leak; content isolation is **untested** (no load show has messages). Needs a scoping decision and a test that proves content is isolated. |

---

## Phase 2A — F30: make the orphaned-show state unreachable

**Decision:** `ON DELETE RESTRICT`, not a repair path.

A site-admin reassign path only helps once someone notices, and nobody will: the
failure is silent and the affected secretary cannot act, because every repair write is
itself gated by `can_manage_show`. `RESTRICT` states the actual invariant — a club is a
tenant root, so its shows must be moved or removed before it can be deleted.

1. Alter `shows_club_id_fkey` from `ON DELETE SET NULL` to `ON DELETE RESTRICT`.
2. Change `seed-demo.sql` to stop delete-recreating its club: replace the
   `DELETE FROM public.clubs WHERE id IN (…)` + `INSERT` pair with
   `INSERT … ON CONFLICT (id) DO UPDATE`, which sidesteps the cascade entirely. Without
   this the seed cannot run against the new constraint.
3. Behavioural SQL test: deleting a club that owns a show is refused; deleting one with
   no shows still works. Register it in BOTH `run-behavioral-sql-tests.sh` and
   `run-behavioral-sql-tests.test.ts`.

**Deferred:** `NOT NULL` on `shows.club_id`. It is the stronger guard but needs the four
already-orphaned audit shows cleaned up first — and one of them cannot be repaired
in-app, which is this finding. Do it after Phase 3.5.

**Accepted trade-off:** club deletion becomes harder for a real admin. That is the
correct direction, but it is a deliberate cost, not an oversight.

---

## Phase 2B — F26: High in Trial

**Rules read** from `docs/rulebooks/akc-scent-work-regulations.txt`, Chapter 6. This is
a club award, not an AKC-recorded one, but it is computed from qualifying data and must
not be invented.

**§8 — High in Trial.** Offered only when a club runs **more than one element**
(Container, Interior, Exterior, Buried) at a given difficulty level. Eligible teams are
those that **entered every element offered at that level and qualified in each**.
Handler Discrimination is **excluded**, even when offered. Ranking: fewest **faults
summed across the elements**; tie → fastest **summed time**; still tied → **coin flip**.
**One winner per difficulty level.**

**§10 — limited offerings.** Where elements differ by level, a level's HIT is computed
over all classes *available at that level*. Rulebook example: Container + Interior +
Exterior at Novice and Container + Interior at Advanced gives a Novice HIT across three
elements and an Advanced HIT across two.

**§9 — High Combined Division.** If a club offers HIT **and** Handler Discrimination, it
**must also** confer HCD: same computation, including HD. Our text copy truncates
mid-sentence at a page break, so HCD's tie-break wording must be checked against
`docs/AKC-forms/` or the source PDF before implementing it.

**"High in Class" is not an AKC concept** — zero occurrences in the rulebook. The
equivalent is §6 **Placements 1–4** per class (fewest faults, then time, then coin
flip), which the app already computes correctly (verified during the walk). So task 11
needs one report, not two.

Implementation notes:

- Scope is **trial**, not class — a `reportRegistry` entry with `scopes: ['trial']`.
- The report must **surface ties rather than resolve them**: a coin flip is a human act,
  so a tied pair is displayed as tied and the secretary records the outcome.
- Eligibility needs the element set offered per level, so it is derived from the
  trial's classes, not from entries alone.
- Do **not** reuse `components/awards/AwardsProcessor.tsx` — it computes nothing
  (simulated delays, hardcoded winners). Delete it with this work, along with the test
  that keeps it alive.
- HCD is in scope only once §9's full text is confirmed; ship HIT first.

---

## Phase 3 — Follow-ups from fixes already shipped

| # | Item | Why |
| --- | --- | --- |
| 3.1 | Backfill decision for F33 | Entries written while the server priced day-of at $0 still carry `entry_fee = 0`. A backfill must decide which tier applied on the day each was taken. |
| 3.2 | F16 UI surfacing | `payment_reference` / `payment_received_on` / `payment_notes` are stored and readable but not shown in Entry Management. |
| 3.3 | Regenerate `database.types.ts` | Stale for the columns added by `20260828200000`; the replication mapper reads them through a defensive accessor meanwhile. |
| 3.4 | Do `moved` entries count in financial totals? | Move-up leaves the paid original as `entry_status = 'moved'`. If the Financial Report counts only `confirmed`, that money vanishes from show takings. Unverified. |
| 3.5 | Staging cleanup | Four audit shows, and a move-up-created entry (`7ae6ac8b-…`) whose id falls outside the seed's fixture ranges, so a reseed will not remove it. |

---

## Phase 4 — The deliverable

Rewrite [`user-guides/secretary-guide.md`](user-guides/secretary-guide.md) as one short
card per task — *When you do this / Where / Steps / Gotchas* — from the walk's verified
click-paths, replacing the narrative sections. Blocked on Phase 1 and on 2.2 (task 11
has no steps to document until High in Trial exists).

**Testing (Phase 4):** every card's click-path is re-walked against the live app before
the guide's status moves off `qa-draft`. A card nobody has walked is the failure mode
this whole audit exists to catch.
