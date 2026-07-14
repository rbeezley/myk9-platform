# 008 — Consolidate the secretary day-of plan cluster (verdicts pre-decided)

> Written against commit `15897d862` (2026-07-11). Docs-only plan (eligible for the docs-only direct-to-`main` path — but every archive verdict below has a **verify step**; run it before moving the file). This closes the audit's "Direction B" item: 8 plans marked Active circle the secretary/ringside show-day workflow, and most of them describe work that already shipped. The judgment calls are made in this document; the executor's job is verification + file mechanics.

## Why this matters

CLAUDE.md's phase rule ("consolidate, don't duplicate; deletions are a feature") applies to planning docs too. An agent (or the owner) scanning `docs/` today sees eight Active day-of plans and cannot tell which represent outstanding work. The audit found ≥5 of them are shipped-but-unarchived. Every stale Active plan is a prompt for some future agent to re-implement finished work — the exact failure INTENT.md exists to prevent.

## Archive mechanics (same for every "Archive" verdict)

1. Run the plan's verify step below; if it fails, STOP for that plan and report instead.
2. Edit the plan's `> **Status:**` line to `Complete` (or `Complete — residuals moved to OPEN-TODOS.md` where noted) with a dated note.
3. `git mv docs/plan-<name>.md docs/archive/plan-<name>.md`.
4. Remove the plan's row from `docs/README.md`; fix any inbound links from other live docs (`grep -rn "plan-<name>" docs OPEN-TODOS.md TO-DOS.md --include="*.md"` — repoint to `archive/`).
5. Residuals listed below go to `OPEN-TODOS.md` as one-liners (with this doc as context pointer) — not left embedded in archived plans.

## Verdicts

### 1. `plan-show-day-sequencing.md` — **Archive (Complete)**

All five phases (A row actions, B workbench IA, C tree/guided UX, D operational gaps, E PDF form-fill) are marked complete in the doc itself with merged PR numbers (#217–#275). The doc's own header admits it: "Phase E complete for current scope."
**Verify:** spot-check two exit criteria — `/secretary/shows/:showId` workbench route exists in `apps/myk9show/src` routing, and `gh pr view 275 --json state` shows MERGED.
**Residuals → OPEN-TODOS (check for duplicates first — these are old):** lint debt from PR #196 (`StickyNav.tsx`, `MonogramSectionFolio.tsx` — likely long-fixed; verify with `pnpm lint` before carrying), "restore GHA CI gating" (CI is live again per `reference_ci_pipeline_shape` — drop unless disproven), future non-scent-work official-form expansion (already the openspec `ukc-closeout-packet` lane — link, don't duplicate).

### 2. `plan-atshow-ringside-writes.md` — **Archive (Complete)**

Progress header: Phases 0–4 implemented and verified; migration `20260621171500_ringside_update_entry.sql` applied to staging; account-judge path verified live 2026-06-24 via JWT impersonation. The two named leftovers are owned elsewhere: passcode identity → plan 4 below; "literal browser round-trip walk" is a manual QA gate, not plan work.
**Verify:** `supabase migration list` (or the migrations table) shows `20260621171500` applied; `grep -rn "viaRpc" apps/myk9show/src packages/replication/src | head` shows the client routing on main.
**Residuals → OPEN-TODOS:** one line — "manual browser walk of judge scoring round-trip at `/at-show` (plan-atshow-ringside-writes final gate)".

### 3. `plan-remove-unified-ringside-flag.md` — **Archive (Complete)**

`atShowFeatureFlag.ts` no longer exists; drop migration `20260623120000_remove_unified_ringside_flag.sql` exists (Option C full removal, as decided); `plan-ringside-navigation.md` records the removal as PR #947.
**Verify:** `grep -rn "unified_ringside_enabled" apps/myk9show/src` returns nothing (migrations dir will still match — that's history, fine). Also update auto-memory `project_atshow_gating_map` if it still lists two gates: only `AtShowAccessGate` remains.

### 4. `plan-ringside-entries-read-authz.md` — **Archive (Complete — residuals to OPEN-TODOS)**

Phases A–E all marked DONE in-doc (claim-gated view tier, RPC claim tier, `validate-passcode` minting, client adoption, anon sign-ins enabled, trigger guard `20260625000000`, recurring cleanup `20260625000100`). Security review doc exists with 0 crit/high/med. Auto-memory concurs ("passcode anon-session DONE 2026-06-24") and names the residuals.
**Verify:** both migrations applied; `docs/security-review-2026-06-24-ringside-passcode-phase-c.md` exists.
**Residuals → OPEN-TODOS:** the two LOWs — anon-user hard-delete/TTL sweep, and CAPTCHA (or rate-limit hardening) on `validate-passcode`. Update auto-memory `project_ringside_entries_read_rls` to point at OPEN-TODOS instead of the archived plan.

### 5. `plan-ringside-occ-conflict-storm.md` — **Archive (Complete — residuals to OPEN-TODOS)**

Remediation #2 (self-correcting conflicts + backoff) is verifiably IN the code: `MutationManager.ts` carries the `OccRejectionError` token-advance + `occRetries` capped backoff with the PR #961 review-fix comments, and `reconcileDirtyRow`/`reconcilePendingMutationsForRow` close the loop. #1 was a one-time operational action (done — the 2026-06-25 incident cleared). #4 (E2E isolation) shipped separately (nightly QA isolation, #449).
**Verify:** `grep -n "occRetries" packages/replication/src/MutationManager.ts` non-empty; staging CPU normal in Supabase dashboard (owner glance, optional).
**Residuals → OPEN-TODOS:** remediation #3 (cut redundant Realtime WAL load — owner decision + SQL) **if** not already covered by the realtime-publication-audit work (#584); check that first and link rather than duplicate.

### 6. `plan-ringside-navigation.md` — **Verify-then-archive (likely Complete)**

`RingsideHome.tsx` and `RingsideEntryPage.tsx` (+ tests) exist in `apps/myk9show/src/features/at-show/`, matching the plan's landing table. Confidence is high but the audit did not verify the sidebar item or the auto-jump behavior.
**Verify (all three, in code not memory):** (a) permanent "Ringside" sidebar item rendered for every role; (b) bare `/at-show` routes signed-in users to RingsideHome / auto-jump with exactly one live show; (c) anonymous users still get `SmartSignInPage`. If any fails, leave the plan Active and add a status note naming the gap instead.
**Also:** auto-memory `project_atshow_route_shape` says bare `/at-show` = SmartSignInPage only — stale if (b) passes; update the memory.

### 7. `plan-class-status-auto-derivation.md` — **Keep (stub), one edit**

Honest stub, correctly blocked on a PO interview (4 locked questions in the doc). This is the **only genuinely open design decision** in the day-of cluster. Edit: its companion-plan link points at the archived workbench-collapse plan — confirm the `archive/` path resolves; add a line noting the presentation half shipped 2026-07-02 (already documented in its status note) and that the remaining scope is server-side derivation only.

### 8. `plan-pull-management-split.md` — **Keep (deferred), one edit**

Explicitly Phase 2 post-Stripe, revisit at `plan-entry-payment-request.md` Task 3.5. Correctly parked. Edit: add a cross-link to [`docs/plan-stripe-golive-enforcement.md`](../plan-stripe-golive-enforcement.md) (written 2026-07-11) so the two Stripe-gated plans reference each other — when Stripe go-live work starts, both surface together.

## Net effect

Day-of cluster goes from 8 Active plans → 2 (one stub awaiting a PO interview, one deferred behind Stripe), with all real residual work as OPEN-TODOS one-liners. The next agent asked "what's left for show day?" gets a truthful answer from the index.

## Out of scope

- Any code change. Archiving plans outside this cluster (the full ~50-row Active reconcile stays in the audit backlog / plan 006). Rewriting the kept plans' content beyond the two named edits.

## Done criteria

- Verdicts 1–5 archived (or individually reported blocked with the failing verify evidence); verdict 6 archived or annotated; verdicts 7–8 edited in place.
- `docs/README.md` index rows updated; no live doc links to a moved file's old path.
- OPEN-TODOS.md carries the residual one-liners (deduped against existing entries).
- Stale auto-memories updated where named (gating map, route shape, entries-read RLS).
- `pnpm lint` green; commit is docs-only (verify the filelist before any direct-to-main push).
