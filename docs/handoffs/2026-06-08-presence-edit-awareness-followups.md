# Handoff — 2026-06-08 — Show-presence edit-awareness: what's next

**Context:** Phase 3 "soft edit awareness" of [`docs/plan-show-presence.md`](../plan-show-presence.md) §6 is **complete and ENABLED** (`features.showEditAwareness: true`). The "{name} is editing this" advisory badge is live on every edit surface:

- `ShowEditPanel` (show) — #593
- `EditEntryDialog` on `ClassDetailsPage` (staff entry/results edit) — #593
- `EntryEditDialog` on `MyEntriesPage` (exhibitor self-edit, **cross-surface** with the secretary) — **#597**

PRs: #593 (impl + Codex-found first-mount race fix) → #594 (flag flip) → #597 (exhibitor cross-surface). The Phase 3 backlog is now **empty**.

---

## 0. First, confirm the live validation (cheap, do this regardless)

The feature is enabled on staging (`myk9-platform-myk9show.vercel.app`). Confirm with two browser contexts (two accounts, or one + incognito):

- Two staff open the **same show** edit panel → each sees a calm "{other} is editing this" badge; **hides for self**; **clears** when the other closes.
- Two staff open the **same entry** on `…/shows/:showId/trials/:trialId/classes/:classId` → `EditEntryDialog` shows the other's badge.
- **Cross-surface:** an exhibitor editing their entry (`MyEntriesPage`) and a secretary editing the same per-class row see each other (per-class badge; see #597 note below).
- **Privacy:** an exhibitor does NOT see another exhibitor's badge (staff-only visibility).
- **Calm/advisory:** Save stays enabled; muted amber dot, not an alarm.

**Kill switch is one line:** `features.showEditAwareness: false` (`apps/myk9show/src/config/features.ts`), or env `VITE_SHOW_EDIT_AWARENESS`.

---

## 1. ✅ DONE — Exhibitor cross-surface (was the Phase 3 tail; closed by #597)

Recorded here because the solution to the id-grouping subtlety is worth knowing. The exhibitor `EntryData` is a **registration grouping** (`classes: EntryClass[]`); `groupEntriesByShowAndDog` collapses a dog's N class rows into one card whose `id` is only the **first** row's `entries.id`. So the shared key with the secretary side (which keys on per-class `entries.id`) is **`EntryClass.id`**, not `EntryData.id`. #597's resolution, respecting the single `editing` slot per user:

- **Read** = per-class-row `<EditingBadge entityId={classEntry.id}>` — exact for every class.
- **Write** = `useEditingPresence('entry', entry.id)` advertises the group's **primary** id only; for a multi-class group a secretary sees the exhibitor on the primary class — a graceful, advisory-only gap, never a wrong-entity badge.
- A per-dialog `ShowPresenceProvider showId={entry.showId}` wraps just the open dialog (the cross-show `MyEntriesPage` can't take a page-level one).

**Latent enhancement (optional, low priority):** the write side broadcasts one slot, so multi-class exhibitor edits only advertise the primary class. A faithful fix would widen the presence payload from a single `editing` slot to a set and broadcast per-class — but that touches `types.ts`, the `useShowPresence` setters, `whoIsEditing`, and every consumer. Not worth it unless real multi-class contention is observed.

---

## 2. Phase 4 — conflict surfacing (the next MAJOR phase; don't start without owner)

This is the **integrity backbone** ([`docs/plan-show-presence.md`](../plan-show-presence.md) §2.5, §6 Phase 4, §7) — a general same-field collision detector at the single `syncReplicatedTable` chokepoint (`packages/replication/src/syncReplicatedTable.ts` ~99–119) + `packages/replication/src/conflict/ConflictResolver.ts`, emitting `replication:conflict` instead of silently resolving last-write-wins.

- **Highest blast radius** in the plan — touches the shared sync path every replicated table uses. Ships behind its **own** §12 kill switch.
- **Non-negotiable before GA**, but blocks nothing visible (the silent-LWW it fixes is pre-existing, not introduced by Phases 1–3).
- Covers scoring + check-in **automatically** as instances of the general net — do NOT special-case per surface.
- Needs `/codex:review` + a second reviewer. Treat as its own session/track.

**Suggested first move:** read §2.5 + §6 Phase 4 + §7 in full, then write a focused implementation plan (the chokepoint, the conflict event shape, the surfacing UX, the flag) before touching the replication layer.

---

## 3. Conventions

- **Work in a worktree**, never the primary checkout (concurrent agents share the main repo — this very handoff raced PR #597, which landed mid-PR). `bash scripts/bootstrap-worktree.sh` if deps are missing.
- **main is protected** — branch + PR everything, even docs.
- Run `gh pr merge` from the **main repo dir**, never inside a worktree.
- Before opening a PR, `git fetch origin main` and check nothing raced you (a concurrent merge can silently conflict your branch — happened here).
- **Codex review default-ON** for behavior/state-shape/render-gate changes (`/review` + `/codex:review`).
- `pnpm typecheck` (NOT raw tsc) + `pnpm lint`; run the **full** myK9Show suite for any change that flips a flag default or touches shared presence/replication code (the shared `src/test/mocks/supabase.ts` can light up dormant code in other pages' tests). Known unrelated flake: `src/test/debug-database.test.ts` (live-DB timeout).
- Edit-awareness primitives live in `apps/myk9show/src/features/show-presence/`. The kill switch is `editAwarenessFlag.ts` → `showEditAwarenessEnabled()`.
