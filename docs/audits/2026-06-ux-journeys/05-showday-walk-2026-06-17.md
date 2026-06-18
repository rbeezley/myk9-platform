# Show-Day Walk: Phase A–F Arc (Lane 1, Step 4)

**Date:** 2026-06-17
**Auditor:** Claude (Opus 4.8), via `qa-feature` skill
**Scope:** Launch-gate **manual show-day walk** of the full Phase A–F arc against the canonical
Lane 1.1 seed (`Heartland Scent Work Classic`, show `dededede-…0010`, PR #797). Walked as the
roles actually hand off: **secretary ↔ steward ↔ judge**. Covers the secretary show surface
(`/shows/:showId/*`) and the unified ringside (`/at-show/:showId`, NOT base `/at-show`, which is
the `SmartSignInPage` gate — see [[project_atshow_route_shape]]).
**Intent targets:** Secretary _"That was easy"_, Judge _"Invisible technology"_, Steward _"I've
got this under control"_ ([`docs/INTENT.md`](../../INTENT.md)).
**Accounts:** `secretary@myk9t.com`, `judge@myk9t.com` (live Playwright walk on
`http://localhost:5173`, worktree dev server, shared Supabase `sojmvhhwsjxmfistvzbe`). Anon
public-results read tested in a **fresh cold session** per [[feedback_verify_anon_in_cold_session]].
**Mutation discipline:** No scores submitted; no shared-data writes. Scoresheet/status surfaces
were opened read-only and dialogs cancelled.

---

## TL;DR

The **secretary half** of show day is coherent and strong. The consolidated **Show Desk**
("During the show" → status chips + Show Map + Closeout on one page) and the staff ringside flow
(class picker → class → scoresheet) both fit their intents, and the released class renders
accurate placements at ringside and through the public results **view** (data layer returns 200).

The **steward ↔ judge half is effectively un-walkable on the current seed**, and the public
**results page** dead-ends for true guests. Three launch-gate blockers:

- **S1 (HIGH):** Public `/results` deep link dead-ends for a guest ("No Classes Available") — the
  page reads the class through the **replication layer only**, with no `getPublicClassById`
  direct read. The released results *view* returns 200, but the page bails before rendering it.
- **S2 (HIGH):** Judge ringside handoff fully blocked — **no `judge_assignments` fixture**, so the
  judge dashboard has no route to a ring, and a judge admitted to ringside directly sees **0
  entries everywhere** ("No Entries Yet") due to entry-visibility RLS.
- **S3 (HIGH):** Steward handoff un-walkable — **no ringside passcode seeded**, so the
  `SmartSignInPage` passcode branch (the steward's documented entry) can't be exercised.

S1 is an app bug (consolidation-safe: add a direct-read fallback). S2/S3 are primarily **fixture
gaps** — the Lane 1, Step 1 seed seeded the secretary gaps but not the ringside-role handoffs.

**Scorecard recommendation: hold the show-day / ringside golden path at Yellow** until S1 lands
and S2/S3 fixtures exist so the judge and steward paths are walkable end to end.

---

## Phase → surface map (confirmed live)

| Phase | Arc step | Surface walked |
| ----- | -------- | -------------- |
| **A** | Setup / check-in | `/shows/:showId/setup` + `/shows/:showId/show-desk` (status chips, Show Map) + Entry Management |
| **B** | Gate / run order | Show Desk → per-class **Run order** / **Mark Class Started**; ringside **Change Status** dialog (steward states) |
| **C** | Scoring (judge/steward) | `/at-show/:showId/class/:classId/score/:entryId` (timer + Q/NQ/Absent/Excused) |
| **D** | Results recording | Ringside class **Completed** tab (placements/medals/time); `/submit-results` |
| **E** | Results release | `/shows/:showId/results-control` (presets) → public `/results` view |
| **F** | Wrap-up | `/shows/:showId/reports` (check-in / catalog / results); Closeout reconciliation |

---

## Findings (ranked by severity)

### S1 — HIGH — Public results page dead-ends for a true guest (Phase E)

**Surface:** `/shows/:showId/trials/:trialId/classes/:classId/results` → `ClassDetailsPage`.
**Observed (cold anon session):** hard-loading the released Container Novice A results link shows
**"No Classes Available"** (a create-a-show empty state), not the 3 placements.
**Root cause (confirmed in code + network):**
- The page bails to the empty state at
  [`ClassDetailsPage/index.tsx:273`](../../../apps/myk9show/src/pages/ClassDetailsPage/index.tsx)
  (`if (!classId || !currentClass)`).
- `currentClass` comes from `useClassDetailsData()`, which sources the class **only** from the
  replication layer — React Query `classes` + `replicatedTrialClasses` (trialStore), plus a
  `replicatedClassesTable.sync('')` call. For a true guest the replicated store is cold-empty
  (guest sync is skipped), so `currentClass` is `null`.
- Meanwhile the anon network log shows the **release-gated results view succeeds**:
  `GET /rest/v1/view_public_entry_results?...&class_id=eq.dec1a55e-…031 → [200]` with data. PR #799
  repaired the *results* read; the **class-identity** read on this page is still replication-only.
- `getPublicClassById` / `getPublicTrialById` **do not exist** in the codebase (grep empty). The
  precedent to mirror is `getPublicShows` in
  [`services/database/shows/reads.ts:99`](../../../apps/myk9show/src/services/database/shows/reads.ts).

**Why it matters:** sharing a results link is a core post-show flow ("results in clicks", INTENT
§"After the show"). A guest clicking a shared link sees a dead-end that reads like the show
doesn't exist. This is exactly the Lane 3.7 public-route replication leak class
([[project_replication_leak_sweep_lane_3_7]]).
**Consolidation-safe remedy (link, don't duplicate):** add `getPublicClassById` (direct PostgREST,
mirroring `getPublicShows`) and have `useClassDetailsData` fall back to it when the replicated
store is cold. No new page — the existing `/results` route renders once `currentClass` resolves.
Add a `*.test.ts` pinning the anon column set. Confirm the sibling trial-identity page (`/trials/:trialId`,
`TrialDetailsPage`) for the same leak.

### S2 — HIGH — Judge ringside handoff fully blocked: no assignment → no ring, no entries (Phase B/C)

**Surface:** `/judge/dashboard` and `/at-show/:showId`.
**Observed:** `judge@myk9t.com` lands on `/judge/dashboard` → "No Judging Assignments Yet" (clean
empty state). Entering ringside directly, the access gate **admits** the judge, but **every class
shows `0 / 0`** and opening Container Novice A (3 scored entries) shows **"No Entries Yet"** — the
judge sees zero entries across the whole show, after sync completes (waited; still 0/0). Only
`view_public_entry_results [200]` appears in the judge's network log; the replicated per-show
entry store returns nothing.
**Root cause:** the seed connects **no judge** to Heartland — no `judge_assignments` row (table
exists since migration 005) and no club-scoped role for the judge. Entry-visibility RLS therefore
returns 0 rows to the judge, and the dashboard has nothing to route from. Secondary: the
`AtShowAccessGate` admits a judge with **zero visibility**, producing an "allowed in but nothing
here" dead-end rather than an explanatory state — at odds with the Judge "invisible technology" /
Steward "in sync" intents (a judge would think the ring is empty).
**Consolidation-safe remedy:**
1. **Fixture (DONE — `seed-demo.sql` §11):** seeds a `judge_assignments` row linking
   `judge@myk9t.com` to the Heartland show, so `/judge/dashboard` surfaces the assignment. This
   makes the judge's **scheduling** surface walkable.
2. **Entry-visibility (verified caveat):** a `judge_assignments` row does **not** satisfy
   `entries_select` (migration 129 = `can_manage_show` / handler / dog-owner only), and
   `can_manage_show` excludes the `judge` role — so the assignment alone won't make entries visible
   at ringside. Ringside entry visibility for a non-managing role is the **passcode /
   `ringside_session`** path (S3). Whether a passcode-only role then reads entries is an open RLS/
   data-path question — needs a follow-up trace, not a seed.
3. **Product (flag for decision, not a new surface):** when a judge is admitted to ringside with no
   visible entries, show an explanatory empty state ("No assignments at this show — ask the
   secretary") instead of silent `0/0` across every class.

### S3 — HIGH — Steward handoff un-walkable: no ringside passcode seeded (Phase B)

**Surface:** `SmartSignInPage` passcode branch (`/at-show` / `/sign-in`, "Email or show passcode").
**Observed:** the unified sign-in classifier correctly splits email vs. passcode (5-char) and the
copy is clear. But **no ringside passcode / `ringside_session` is seeded** (grep empty), so the
steward's documented entry path can't be exercised against Heartland. The steward run-flow itself
exists and is good — the ringside **Change Status** dialog offers No Status → Checked In →
Conflict → Pulled → At Gate → Come to Gate → In Ring → Completed (matches Steward "in control").
**Consolidation-safe remedy (DONE — `seed-demo.sql` §12):** seeds known Heartland ringside
passcodes so the passcode → grant → `/at-show/:showId` path is walkable. Mechanics that shaped the
fix: `show_passcodes.passcode_hash` is a **peppered HMAC** (vault `passcode_pepper`) and the table
REVOKEs all access from anon/authenticated — a hand-written hash can't validate. The seed therefore
computes the hash with the DB's own `_hash_passcode()`, wrapped in a guarded `DO` block that skips
(RAISE NOTICE) on a DB without the pepper rather than aborting the reset. **Demo codes:** judge
`jh3k9`, steward `s7m2p`. `ringside_sessions` is **not** seeded — it's created at runtime by the
heartbeat. No new UI.

### S4 — MEDIUM — Withdrawn/refunded entry counted as a live entry across surfaces (Phase A/D)

**Surface:** Show Desk → Show Map stats and class nodes; ringside class picker.
**Observed (same fixture, three places disagree):**
- Show Map header: **"9 Entries"** (8 live + the withdrawn Maple `…059` = counted).
- Show Map class node: Exterior Excellent **"1/2 entries complete (50%)"** — its only live entry
  (Juniper, unscored) is `0`; the withdrawn entry inflates the denominator **and** is counted as
  "complete."
- Ringside picker: Exterior Excellent **"0 / 2"** (same withdrawn entry in the denominator; should
  be `0/1`).
- Closeout reconciliation **correctly isolates** it: "1 pulled · 0 review."
**Why it matters:** the operational counts a secretary/steward reads to know "what's left" are
inflated by an entry that's out of the show, and the "50% complete" reading is actively wrong.
Two regions on the *same page* count it differently.
**Consolidation-safe remedy:** exclude `entry_status IN ('withdrawn','scratched')` from the
live-entry denominator in the shared class-entries query feeding both Show Map and the ringside
picker (one query, two consumers — fix once). Keep Closeout's separate "pulled" count.

### S5 — MEDIUM — Contradictory trial status badges (Phase A/B)

**Surface:** Show Desk → Show Map, trial node.
**Observed:** Saturday Trial simultaneously reads **"Not started"**, **"Needs wrap-up"**, and
**"1/3 classes complete (33%)"**. A trial that is one-third complete cannot be "Not started," and
"Not started + Needs wrap-up" is self-contradictory.
**Why it matters:** conflicting status is exactly what erodes the Steward/Secretary "I've got this
under control" feeling (`INTENT.md:55`) — the glanceable summary lies.
**Consolidation-safe remedy:** derive a single coherent trial status from class progress
(`0 complete` → Not started; `0 < complete < total` → In progress; `complete === total` →
Complete/Needs wrap-up). The per-badge flags should be mutually exclusive on the headline row.

### S6 — LOW/MEDIUM — Stale `// INTENT:` comment: judges now land on `/judge/dashboard` (doc-sync)

**Surface:** [`docs/INTENT.md:152`](../../INTENT.md) (and the redirect code it guards).
**Observed:** the load-bearing comment says _"Judges redirect to /exhibitor/dashboard (not
/judge/dashboard) because the judge dashboard isn't ready for production yet. When it is, update
this AND the judge onboarding flow."_ Live behavior: the judge lands on **`/judge/dashboard`**
(now shipped, with a real empty state). The comment is stale and now misleading.
**Remedy:** update the INTENT comment to match shipped behavior and confirm the judge onboarding
flow it cross-references. (Per CLAUDE.md, INTENT comments are load-bearing — this is the
"when it is [ready], update this" follow-through, not a behavior change.)

### S7 — LOW — Printed AKC check-in sheets show a blank "Judge:" field (Phase A/F)

**Surface:** `/shows/:showId/reports` → default AKC check-in sheets (per element).
**Observed:** every sheet (Container/Interior/Exterior/Buried) prints "Judge:" with no name —
downstream of S2's no-assignment gap. Resolves once a judge is assigned. No separate fix needed
beyond S2's fixture; noted so it isn't mistaken for a reports bug.

### S8 — LOW — Single "Area 1 time" field for a 2-area class (Phase C, verify)

**Surface:** `/at-show/:showId/class/:classId/score/:entryId` (Interior Advanced, `num_areas=2`,
`timer_mode='single'`).
**Observed:** the scoresheet shows one "Area 1 time" input. With `timer_mode='single'` this is
likely a deliberate single-total-time mode, but labeling it "Area 1" when the class has 2 areas
could mislead a judge. **Verify** with the scoring domain owner whether Area 2 capture is expected;
if single-time is correct, drop the "Area 1" qualifier.

### S9 — LOW — "Change Status" dialog has two identically-labeled "Close" buttons (Phase B/C, a11y)

**Surface:** ringside entry **Change Status** dialog.
**Observed:** two buttons both exposed as "Close" (likely the header ✕ and a footer Close) — a
screen-reader redundancy. **Remedy:** give the icon button a distinct accessible name (e.g.
"Dismiss") or remove the duplicate.

---

## What's coherent (launch-gate positives, with evidence)

- **Secretary show surface is genuinely consolidated.** One tab bar — Setup · Show Desk · Entry
  Management · Reports · Results Control · Submit Results — and **Show Desk** carries the whole
  show-day model on one page: attention chips ("3 entries waiting for review", "1 waiting for
  check-in", "1 class needs judge signature"), the **Show Map** tree, and **Closeout**
  reconciliation. No fragmentation; matches "That was easy."
- **Dashboard deep-link is accurate.** "3 entries pending review" → `entry-management?entryTab=pending`
  matches the true count (the F2 dashboard side is right).
- **Staff ringside flow works end to end.** Class picker → class → Pending/Completed tabs →
  scoresheet, all behind a clean access + enablement gate.
- **Released class renders accurate placements at ringside.** Container Novice A Completed tab:
  Willow #100 🥇 1st Q 00:38.50 · Scout #103 2nd · Cooper #105 3rd — exact to the seed. Medal/Q/time
  fits Judge "instant feedback."
- **Scoresheet fits "tap and done."** Large Qualified/NQ/Absent/Excused buttons, a timer with
  "Max Time: 3:00", Save disabled until a result is chosen (no empty submits).
- **Results Control presets are legible.** Immediately / After Class / After Review, with the
  active "Immediately" preset matching the seed `open` preset (auto-release on class complete).
- **Public results *view* read works at the data layer** for anon (`view_public_entry_results`
  → 200) — PR #799 holds; the gap (S1) is the page's class-identity read, not the results gate.

---

## Recommended action order (all consolidation-safe)

1. **S1 — DONE (this PR).** `getPublicClassById` (anon-safe direct read) +
   `usePublicClassById` cold fallback wired into `useClassDetailsData`, with a `publicReads.test.ts`
   pinning the no-PII-join invariant + mapping. Unblocks the public results share flow. **Still
   open:** check `/trials/:trialId` (`TrialDetailsPage`) for the twin leak.
2. **S2 + S3 fixtures — DONE (this PR, `seed-demo.sql` §11/§12).** Judge assignment + known ringside
   passcodes (judge `jh3k9`, steward `s7m2p`) seeded. **Re-run this walk after the seed is applied to
   staging** to confirm the handoffs — and trace the open entry-visibility-via-passcode RLS question
   (S2.2) end to end.
3. **S4 / S5** — exclude withdrawn/scratched from the shared live-entry count; collapse trial
   badges to a single coherent status. *(not in this PR)*
4. **S6** — update the stale INTENT comment. *(not in this PR)*
5. The judge/steward phases remain **unverified, not passing** until the seed is applied to staging
   and re-walked.
