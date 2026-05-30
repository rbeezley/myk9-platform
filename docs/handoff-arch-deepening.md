# Handoff — Architecture Deepening + Unify Sequencing

Written 2026-05-30 at end of arch Phase 1 session. Self-contained — read this
cold; no conversation context needed.

---

## Where things stand

### PR #455 — arch Phase 1 (delete dead code)

- **State:** Open. CI "Quality Checks" job was in-progress at handoff.
  Vercel checks failing with rate-limit noise (not code failures) — ignore them.
- **What's in it:** 13 files / 3,599 lines deleted from `apps/myk9show` (search
  cluster + batchOperations + connection-pool + useSearchDatabase + searchMappers
  + search-analytics types). Reviewer finding also fixed: 3 stale tsconfig.app.json
  exclude entries removed; plan Phase 1 section rewritten to ✓ COMPLETE.
- **To merge:** Run from the **main repo directory** (`/AI Projects/myk9-platform`),
  NOT from inside the worktree (per `feedback_merge_from_main_worktree`):
  ```bash
  cd "/Users/richardbeezley/AI Projects/myk9-platform"
  gh pr merge 455 --squash --delete-branch
  git pull --ff-only
  git fetch --prune
  ```
  Then remove the worktree (from the main repo dir, after the shell is no longer
  inside it):
  ```bash
  git worktree remove ".claude/worktrees/arch-phase-1-delete-dead-code" --force
  ```

### Unify plan status (as of 2026-05-30)

- Phase 1 (mount + gate): MERGED (#425, #441, #442, #443, #446, #444)
- Phase 2 (Tailwind migration + at-show surface polish): MERGING NOW (#453)
- Phase 3 (ringside_sessions, push delivery, RLS, RPC write paths): NOT STARTED

---

## Recommended sequence — next steps

The ordering below was chosen to shrink what unify Phase 3 carries, not to wait
for it. Arch Phases 1–3 are "do now, before the merge"; Phases 4–6 are additive
or dependent.

```
[NOW]  Merge PR #455             ← arch Phase 1 complete
[NOW]  Arch Phase 3              ← state directory consolidation (1–2 hr, zero behavior change)
[THEN] Unify Phase 3             ← ringside_sessions (security-review window)
[∥]    Arch Phase 2              ← replication adapters (parallel with unify Phase 3 review)
[AFTER] Arch Phase 4             ← invalidation contract (after Phase 3 settles)
[AFTER] Arch Phase 5             ← entry orchestration (depends on Phase 4)
[OPP]  Arch Phase 6              ← judges ADR-008 (opportunistic, when judges/ is touched)
```

---

## Arch Phase 3 — what to do (start here after merging #455)

**Goal:** Collapse `store/` + `stores/` → one canonical `store/`; `context/` +
`contexts/` → one canonical `context/`. Rename the checkout `entryStore` so
there is exactly one `entryStore` in myK9Show before the `packages/ringside`
store arrives and widens the collision.

**Why now:** The three-way `entryStore` collision (`store/entryStore.ts` with 55
callers vs. `stores/entryStore.ts` with 0 direct callers vs.
`packages/ringside` store) exists today. Unify Phase 3 will bring the ringside
surface into myK9Show — if the naming collision isn't resolved first, the merge
lands on top of it.

**Risk:** Low — the `stores/entryStore` twin has no direct callers; this is a
pure locality/navigability refactor with no behavior change.

**Steps:**
1. Open a new worktree:
   ```bash
   cd "/Users/richardbeezley/AI Projects/myk9-platform"
   git worktree add .claude/worktrees/arch-phase-3-state-dirs -b worktree-arch-phase-3-state-dirs
   bash scripts/bootstrap-worktree.sh
   ```
2. Confirm populations:
   ```bash
   ls apps/myk9show/src/store/       # ~52 files
   ls apps/myk9show/src/stores/      # ~5 files
   ls apps/myk9show/src/context/
   ls apps/myk9show/src/contexts/
   ```
3. Pick canonical: `store/` (higher population) and `context/` (higher
   population). Record the rule in a comment at the top of each directory's
   `index.ts` or in CONTEXT.md.
4. Identify the checkout store in `stores/entryStore.ts`. Rename it to match its
   actual concern — it neighbors a cart/checkout flow, so something like
   `cartStore` or `checkoutEntryStore` removes the `Entry` collision. Check what
   `stores/index.ts` re-exports and re-point those consumers.
5. Move `stores/*.ts` files into `store/` and `contexts/*.ts` files into
   `context/`. Update all import paths (`grep -rn "from.*stores/"` and
   `"from.*contexts/"`).
6. Delete now-empty `stores/` and `contexts/` directories with `git rm -r`.
7. `pnpm typecheck` — must be green.
8. Smoke-verify: `pnpm dev:show` → confirm scoring surface and checkout flow
   both load without console errors.
9. Add a one-line entry to CONTEXT.md under "State Management" recording the
   canonical directory names so the ringside reconciliation knows where to land.

**Acceptance:**
- `ls apps/myk9show/src/` shows `store/` (not `stores/`) and `context/` (not
  `contexts/`).
- `grep -rn "entryStore" apps/myk9show/src/` returns exactly one file
  (the domain show-entry store, not the checkout twin).
- `pnpm typecheck` green.

---

## Unify Phase 3 — brief context for sequencing

**What it covers:**
- `ringside_sessions` table (server-side SECURITY DEFINER RPC — NOT an
  IndexedDB-replicated table; unify plan owns this).
- Push delivery fanout for ringside notifications.
- RLS policies for at-show anonymous/passcode access.
- RPC write paths for the unified at-show gate.

**Why Phase 3 doesn't add adapter backlog to Arch Phase 2:**
`ringside_sessions` is server-side (SECURITY DEFINER RPC), not a table the
client syncs via IndexedDB. So unify Phase 3 does not create new replication
adapter work for Arch Phase 2. The 8 adapters in Arch Phase 2 are purely
existing myK9Show replication tables.

**Security review window = natural parallel slot for Arch Phase 2.** Unify
Phase 3 will have a security review period (RLS, RBAC, RPC policies) where code
is written but not yet pushed to the shared DB. That window is the right time to
run Arch Phase 2 adapter migrations — they are independent and have no DB writes.

---

## Arch Phase 2 — what's waiting (run parallel with unify Phase 3 review)

**Goal:** Route all 8 myK9Show replication adapters through `syncReplicatedTable()`
instead of their inlined ~110-line sync loops.

**8 adapters to migrate** (under `apps/myk9show/src/services/replication/`):
`ReplicatedArmbandsTable`, `ReplicatedClassesTable`, `ReplicatedClubsTable`,
`ReplicatedDogsTable`, `ReplicatedJudgeAssignmentsTable`, `ReplicatedShowsTable`,
`ReplicatedTrialsTable`, `ReplicatedWaitlistEntriesTable`

Reference: `ReplicatedEntriesTable` (already done — use as the canonical shape).

**One adapter per PR.** Behavior-preserving only — do NOT improve conflict
policy during migration.

**Shared-package constraint:** Do NOT alter the `syncReplicatedTable` /
`SyncReplicatedTableAdapter` interface while `apps/myk9q` still exists.
Verify with workspace-root `pnpm typecheck`, not just app-level.

---

## Key files for reference

| File | Why |
|------|-----|
| [`docs/plan-architecture-deepening.md`](plan-architecture-deepening.md) | Full phase spec with acceptance criteria |
| [`docs/plans/2026-05-17-unify-myk9show-myk9q.md`](plans/2026-05-17-unify-myk9show-myk9q.md) | Unify plan — Phase 3 detail |
| `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts` | Canonical adapter shape for Phase 2 |
| `packages/replication/src/syncReplicatedTable.ts` | The seam Phase 2 routes through |
| `apps/myk9show/src/store/entryStore.ts` | The 55-caller canonical store (keep) |
| `apps/myk9show/src/stores/entryStore.ts` | The checkout twin (rename + move) |

---

## Conventions to carry forward

- Merge PRs from main repo dir, never from inside a worktree.
- `pnpm typecheck` (not raw `tsc`) — uses `tsconfig.app.json` with stricter flags.
- `git rm` for tracked-file deletes (not plain `rm`).
- Re-verify liveness with `grep -rn` immediately before any deletion.
- Before pushing a deletion PR: `grep -rn <symbol> --include="*.md"` to catch
  stale doc references.
- Worktree remove BEFORE branch delete (git refuses branch delete while worktree
  holds it).
