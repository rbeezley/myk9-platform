# Handoff — 2026-06-08 — Show-presence edit-awareness: what's next

**Context:** Phase 3 "soft edit awareness" of [`docs/plan-show-presence.md`](../plan-show-presence.md) §6 is **shipped and ENABLED** (`features.showEditAwareness: true`) via PR #593 (impl + a Codex-found mount-race fix) and #594 (flag flip). The "{name} is editing this" advisory badge is live on `ShowEditPanel` (show) and `EditEntryDialog` (entry, on `ClassDetailsPage`).

This handoff covers the three open threads, in priority order. Pick one — they're independent.

---

## 0. First, confirm the live validation (cheap, do this regardless)

The flag was flipped to enable two-browser validation; confirm it actually behaves on staging (`myk9-platform-myk9show.vercel.app`). Two browser contexts (two accounts or one + incognito), then:

- Two staff open the **same show** edit panel → each sees a calm "{other} is editing this" badge; it **hides for self** and **clears** when the other closes.
- Two staff (secretary/admin) open the **same entry** on `…/shows/:showId/trials/:trialId/classes/:classId` → `EditEntryDialog` shows the other's badge in its header.
- **Privacy:** an exhibitor viewing a class does NOT see another exhibitor's badge (only staff).
- **Calm/advisory:** Save stays enabled; badge is muted (amber dot), not an alarm.

**If anything is wrong, the kill switch is one line:** `features.showEditAwareness: false` (`apps/myk9show/src/config/features.ts`), or env `VITE_SHOW_EDIT_AWARENESS`.

---

## 1. Thread A — Exhibitor cross-surface awareness (the Phase 3 tail)

**Goal:** an exhibitor self-editing an entry and a secretary editing the **same** entry see each other's badge. Today only the *staff↔staff* path is wired (`EditEntryDialog` on `ClassDetailsPage`); the exhibitor path (`EntryEditDialog` on `MyEntriesPage`) is not.

### The blocker I already investigated (2026-06-08) — read before coding

The two surfaces key on **different id spaces**, so a naive wire-up would silently never match:

- **Secretary side** (`apps/myk9show/src/pages/ClassDetailsPage/EditEntryDialog.tsx`): keys on `entryId` = a **per-class** entry row id (`rawEntries.find(e => e.id === entryId)`, where `rawEntries` is one class's entries). This is effectively `entries.id`.
- **Exhibitor side** (`apps/myk9show/src/components/entries/EntryEditDialog.tsx`): operates on an `EntryData` that is a **registration grouping** — it has its own `id` PLUS `classes: EntryClass[]`, each `EntryClass` with its own `id`. Confirmed in `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts` (grouping logic ~line 80–85; note the existing comment at ~line 267: *"After grouping, entry.id is the first class row's id and may differ from…"*). So `EntryData.id` is NOT the per-class `entries.id`.

**Therefore:** the cross-surface key must be the **per-class id** (`EntryClass.id` ≈ `entries.id`), not `EntryData.id`. The exhibitor dialog edits **all** of a dog's class-entries at once, so the single `editing` slot in the presence payload (`ShowPresence.editing`, one per user/tab) can't represent "editing N classes." Two design options:

1. **Per-class slot model (bigger):** widen the presence payload from a single `editing` slot to a set, and key the badge per `EntryClass.id`. Touches `types.ts`, `useShowPresence` setters, `whoIsEditing`, and every consumer. Most faithful but more surface.
2. **Coarsen the secretary side instead (smaller):** also broadcast a registration-level editing signal (`entityType: 'registration'`, `entityId: registrationId`) from BOTH dialogs, and show the badge when either matches. Requires the secretary side to know the registration id for its entry (`useMyEntriesData.ts` has `registrationId`; the class-page entry rows would need it too). Less faithful (registration-granular, not class-granular) but one slot.

**Recommendation:** decide granularity with the owner first — class-level (option 1) vs registration-level (option 2). Don't wire before that call; this is the whole reason it was deferred.

### Provider boundary

`MyEntriesPage` is cross-show (`/my-entries`, `/exhibitor/entries`), so it can't take a page-level `ShowPresenceProvider`. Wrap **just the open dialog** in `<ShowPresenceProvider showId={entry.showId}>` (the dialog already has `entry.showId`).

### Then

Instrument `EntryEditDialog` the way `EditEntryDialog` was: a `useEditingPresence(type, openId)` call (gated on `open`) + an `<EditingBadge>` in the header. Add a focused test mirroring `apps/myk9show/src/pages/ClassDetailsPage/EditEntryDialog.editAwareness.test.tsx`. **If id equality / granularity can't be cleanly resolved, STOP and report** rather than ship a silently-mismatching feature. (Background task chip `task_0b5ab25e` tracks this.)

---

## 2. Thread B — Phase 4: conflict surfacing (the next MAJOR phase; don't start without owner)

This is the **integrity backbone** ([`docs/plan-show-presence.md`](../plan-show-presence.md) §6 Phase 4, §7) — a general same-field collision detector at the single `syncReplicatedTable` chokepoint (`packages/replication/src/syncReplicatedTable.ts` ~99–119), emitting `replication:conflict` instead of silently resolving last-write-wins. It is the **highest-blast-radius** change in the plan (touches the shared sync path every table uses), ships behind its own §12 flag, and needs `/codex:review` + a second reviewer. **Non-negotiable before GA** but blocks nothing visible. Treat as its own session/track.

---

## 3. Conventions (unchanged)

- **Work in a worktree**, never the primary checkout (concurrent agents share the main repo). `bash scripts/bootstrap-worktree.sh` if deps are missing.
- **main is protected** — branch + PR everything, even docs.
- Run `gh pr merge` from the **main repo dir**, never inside a worktree.
- **Codex review default-ON** for behavior/state-shape/render-gate changes (`/review` + `/codex:review`).
- `pnpm typecheck` (NOT raw tsc) + `pnpm lint`; run the **full** myK9Show suite for any change that flips a flag default or touches shared presence code (the shared `src/test/mocks/supabase.ts` can light up dormant code in other pages' tests). Known unrelated flake: `src/test/debug-database.test.ts` (live-DB timeout).
- Edit-awareness primitives live in `apps/myk9show/src/features/show-presence/`. The kill switch is `editAwarenessFlag.ts` → `showEditAwarenessEnabled()`.
