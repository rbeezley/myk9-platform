# Plan — Secretary Dashboard Refocus

**Date:** 2026-05-22 (stub) → 2026-05-24 (full plan)
**Status:** **Active.** Audit complete; phased plan below. PO answers captured in [Decision log](#decision-log).
**Companion plan:** [`plan-show-map-workbench-collapse.md`](plan-show-map-workbench-collapse.md) (Option B, shipped). The "Relationship to Secretary Dashboard" section of Option B documents the division of labor this plan completes.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The plan changes one myK9Show secretary flow and its route/sidebar surface, but does not touch auth, RLS policies, migrations, payments, or shared offline replication.

## The idea

After Option B shipped, the per-show **Show Desk** workbench tab owns operational work for a single show. The **Secretary Dashboard** at `/secretary/dashboard` should narrow to **cross-show concerns**: a multi-show home, cross-show roll-ups, and truly personal (non-show-scoped) tasks. Anything per-show that duplicates a workbench or dedicated-page surface is removed or demoted.

## Audit (2026-05-24)

| Surface | File | Classification | Verdict |
|---|---|---|---|
| Header + greeting | `SecretaryDashboardPage/index.tsx:111-129` | `[cross-show]` | Keep |
| My Shows phase sections | `MyShowsSection.tsx` | `[cross-show]` | Keep — core value |
| `ShowPhaseCard` (per-show entry points) | `ShowPhaseCard.tsx:22-174` | `[cross-show]` | Keep — navigation only, not operational |
| `AttentionNeededStrip` | `AttentionNeededStrip.tsx` | `[cross-show]` | **Already nav-only** (verified 2026-05-24 — every item is a `<Link>`, no in-place actions exist). D4 narrows to a copy/framing pass + lock-in test. |
| `TasksTab` — personal tasks (`show_id IS NULL`) | `TasksTab.tsx` | `[cross-show]` | Keep |
| `TasksTab` — per-show filter | `TasksTab.tsx:46` | `[per-show]` | **Remove** — duplicates Show Desk `TasksNotesCard` (same `secretary_tasks` table, same React Query key) |
| `MessagesTab` | `MessagesTab.tsx` | `[per-show]` | **Remove after replacement route is restored** — `SecretaryMessagesPage.tsx` exists, but `/secretary/messages/:showId?` currently redirects to `/secretary/dashboard`; D3a must make the dedicated page reachable before the dashboard tab comes out. |
| `EntriesTab.tsx` (orphan) | `EntriesTab.tsx` | dead code | **Delete** — file exists with tests but is never imported in `index.tsx` |

### Duplicate map

| Dashboard surface | Real home (post-refocus) | Same data? |
|---|---|---|
| Per-show tasks | Show Desk Tools sheet (`TasksNotesCard`) | Yes — `useSecretaryTasks(showId)` same hook + cache key |
| Messages tab | `/secretary/messages` (route/sidebar restoration needed in D3a) | Yes — both use `useMessageStore`; threads are always `show_id`-scoped in DB |
| Per-show attention items | Show Desk adaptive header | Same data, different framing — dashboard becomes nav-only |

### Risks surfaced by audit

1. **`EntriesTab.tsx` orphan** — has unit tests that will need to come down with the file.
2. **`TasksNotesCard` deep-link to `/secretary/dashboard?showId=...`** — currently the round-trip path for per-show task management. **Decision (locked):** replace with a plain `/secretary/dashboard` link (no param). The secretary already knows which show they're in via the workbench; the dashboard target now shows only personal tasks. Simpler than adding an in-workbench anchor.
3. **Messages store lifecycle** — `useMessageStore` is Zustand, not React Query. **Verified (2026-05-24):** `useMessageSubscription()` is invoked at the app root in [App.tsx:201](../apps/myk9show/src/App.tsx:201), not from the dashboard. Removing `MessagesTab` therefore cannot starve the sidebar unread badge — the subscription/fetch trigger is independent of dashboard mount.
4. **No real users yet** — per `project_prelaunch_no_users` memory, both apps are pre-launch. Skip backwards-compat shims (e.g., a redirect from old dashboard tab URLs); rip cleanly.
5. **[ADDED] Empty-state risk** — after D1–D4, a brand-new secretary with zero shows + zero personal tasks sees a near-empty dashboard (header + greeting only). Each phase must include an empty-state design or copy update so the dashboard reads as "you're set up, nothing here yet" rather than broken.
6. **[ADDED] Orphaned `?showId=` query param** — D2 removes the only consumer of `useSearchParams().get('showId')` on the dashboard route. The param becomes a no-op route input. D5's grep step covers cleanup; calling it out here so it's not forgotten.
7. **[ADDED] `useMyShows.attentionNeeded` shape** — verified to return `{ kind, text, href, showName, showId }` items consumed only by `AttentionNeededStrip`. No upstream changes needed for D4's copy pass.
8. **[ADDED] Dedicated messages route is parked** — `SecretaryMessagesPage.tsx` exists under `features/messages`, but `secretaryRoutes.tsx` currently redirects `/secretary/messages/:showId?` to `/secretary/dashboard`, and the Manage sidebar omits Messages. D3a includes route + sidebar restoration before deleting the dashboard tab.
9. **[ADDED] Dashboard task creation/editing still allows show assignment** — removing the filter alone is not enough. `TaskAddForm` and `TaskRow` both expose a show selector, so D2 must either hide those selectors in dashboard context or introduce a personal-only mode.

## Phased plan

Each phase is one PR. Order: dead code first (warm up), lowest-risk duplicate next, highest-risk last.

### D1 — Delete `EntriesTab` orphan

**Why first:** zero behavior change, zero user-visible impact. Confirms tooling and clears the noise before the real removals.

**Scope:**
- Delete `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/EntriesTab.tsx`
- Delete `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/EntriesTab.test.tsx` (and any sibling helpers it imported)
- Grep for `EntriesTab` to confirm no other imports exist; remove any stragglers
- Run `pnpm typecheck && pnpm lint` to confirm clean removal

**Tests:** existing dashboard tests must still pass. No new tests required (deletion only).

**Acceptance:** `git grep EntriesTab` returns nothing under `apps/myk9show/`. CI green.

---

### D2 — Strip per-show task scoping from `TasksTab` + build inline manager in `TasksNotesCard`

**[EXPANDED 2026-05-24 — structural finding]:** During D2 implementation, discovered that `TasksNotesCard.tsx:11-14` was only a *count-card* with a link back to the dashboard's per-show filter — there is NO per-show task management UI in the Show Desk Tools sheet today. The plan's repeated premise "per-show tasks live in the Show Desk Tools sheet" describes an intended B6.5 feature that was never built (only the entry-point card landed). If D2 just removed the dashboard's per-show capability, per-show tasks would become orphaned data. Same shape as the [Audit Route Liveness](../../../../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/feedback_audit_route_liveness.md) trap.

**Resolution (Option A, user-confirmed 2026-05-24):** D2 now bundles the missing prerequisite. Expand `TasksNotesCard` from a count-card into a full inline task manager. After that, the dashboard's per-show capability can be safely removed.

**Why second:** the cleanest duplicate to resolve — same hook, same query key, same table. The expanded `TasksNotesCard` becomes the real per-show task home that the plan always assumed existed.

**Scope:**
- **`TasksNotesCard.tsx` (NEW responsibility — was count-only, now full manager):**
  - Render an inline collapsible task manager scoped to `showId` (mirrors TasksTab's list+add pattern).
  - "+ Add task" button toggles an embedded `TaskAddForm` with `lockedShowId={showId}` so newly created tasks always land on the current show.
  - List of `TaskRow`s for the show's open tasks, with `lockShowEdit` so editing cannot move a task off the show.
  - Keep the count badge in the header. Remove the "Open tasks →" link (no longer needed — management happens here).
  - Update the `// INTENT:` comment to reflect the new "full per-show task manager surface" responsibility.
- **`TaskAddForm.tsx`:** add optional `lockedShowId?: string | null` prop. When defined, hide the show selector and force that value (string `showId` or `null` for personal) on submit. When undefined, behave as today (legacy callers).
- **`TaskRow.tsx`:** add optional `lockShowEdit?: boolean` prop. When `true`, hide the show selector in edit mode and omit `showId` from update payloads.
- **`TasksTab.tsx` (dashboard, now personal-only):**
  - Remove the `initialFilter` prop and the show-filter chip row (`FilterChips`).
  - Call `useSecretaryTasks('general')` to fetch personal tasks (`show_id IS NULL`) directly from the server — the hook already supports this filter value.
  - Remove the `shows` and `clubId` props from the call sites that only existed for show-scoped UI. `clubId` is still needed for task creation (it's a not-null column).
  - Pass `lockedShowId={null}` to embedded `TaskAddForm` so new dashboard tasks always have `showId === null`.
  - Pass `lockShowEdit` to embedded `TaskRow` so dashboard editing cannot push a task onto a show.
  - Remove show-name display from rows when in personal mode (no show to label).
  - Update empty-state copy: "No personal tasks. Per-show tasks live in each show's Tools sheet."
  - Add error state: inline error + retry if `useSecretaryTasks` errors (mirror pattern used elsewhere in dashboard cards).
- **`SecretaryDashboardPage/index.tsx`:**
  - Drop `useSearchParams` import + `showIdParam` plumbing.
  - Drop `initialFilter` prop pass-through to `TasksTab` (lines 200–206).
  - Narrow `openTaskCount` derivation — currently `useSecretaryTasks()` (all tasks) filtered by `status === 'todo'`; change to filter by `status === 'todo' && showId === null` so the badge counts only personal tasks. (Alternative: call `useSecretaryTasks('general')` directly for the badge data; check whether the existing call is needed for any other use first.)

**Tests:**
- `TasksTab.test.tsx`: rewrite — assert chip-row gone; assert `useSecretaryTasks` invoked with `'general'`; assert renders only personal tasks; assert empty-state copy; assert error state surfaces.
- `TaskAddForm.test.tsx` (new or expand): assert `lockedShowId={null}` hides the selector and submits `showId: null`; assert `lockedShowId='abc'` hides the selector and submits `showId: 'abc'`; assert undefined `lockedShowId` preserves legacy "any" behavior.
- `TaskRow.test.tsx` (new or expand): assert `lockShowEdit` hides the show selector in edit mode and omits `showId` from updates.
- `TasksNotesCard.test.tsx`: assert inline `TaskAddForm` renders when "+ Add task" clicked; assert created task has `showId={showId}`; assert `TaskRow` edits omit `showId`; assert NO link to `/secretary/dashboard` exists.
- `SecretaryDashboardPage.test.tsx`: assert no `?showId=` param plumbing reaches `TasksTab`; assert badge counts only personal open tasks.

**Acceptance:**
- Dashboard TasksTab shows only `show_id IS NULL` tasks; no chip row.
- Show Desk's `TasksNotesCard` is a fully self-contained per-show task manager — create/edit/delete all happen inline; no dashboard round-trip.
- The two-homes pattern is gone: per-show tasks live ONLY in `TasksNotesCard`; personal tasks live ONLY on the dashboard.
- Dashboard Tasks badge counts only personal open tasks.

---

### D3 — Add show-filter to `SecretaryMessagesPage`, then remove dashboard `MessagesTab`

**Why third:** Messages is also a clean duplicate, but the dedicated page lacks the show-filter dropdown the dashboard tab offers. D3 must add that capability *before* removing the tab so secretaries don't lose the ability to scope by show.

**Scope (in order):**
1. **Sub-step D3a — Restore and augment dedicated page first:**
   - `secretaryRoutes.tsx`: replace the current `/secretary/messages/:showId?` redirect with the protected `SecretaryMessagesPage` route. Preserve optional path-param compatibility if it is still useful, but make `?showId=` the canonical filter state.
   - Sidebar/config: add the Manage "Messages" nav item back only if the product wants a sidebar entry; if not, document the intentional absence and rely on explicit links. In either case, update `RoleSidebar`/`unifiedSidebarConfig` tests so the route is not accidentally parked again.
   - `SecretaryMessagesPage.tsx`: convert from required route-param scoping (`useParams().showId`) to all-shows-by-default filtering. Add a show-filter dropdown (mirror `MessagesTab`'s current pattern — "All Shows" + managed shows, not only shows that already have threads). Filter `threads` by selected `show_id`.
   - URL state: persist filter via `?showId=` query param so the filter survives refresh and supports deep-linking from Show Desk. If an old `/secretary/messages/:showId` path is visited, normalize it to `/secretary/messages?showId=:showId`.
   - **[ADDED] Empty state for filtered view:** if a show is selected and has zero threads, render "No messages in [Show Name] yet" with a "Clear filter" affordance.
   - **[ADDED] Error handling:** if `useMessageStore`'s `error` slot is populated, surface it inline with retry — mirror the pattern from existing message UIs (`ChatPage.tsx` or `SecretaryMessagesPage` today).
   - **[ADDED] RLS sanity check:** verify the secretary's RLS scope already permits reading threads for all `show_id`s that appear in their list. The filter narrows what's *shown*, not what's *fetched*, so RLS is unchanged — but call this out so a reviewer doesn't have to re-derive it.
   - Tests: assert `/secretary/messages` renders the page instead of redirecting, assert filter dropdown renders, assert thread list narrows when a show is selected, assert empty state for zero-thread shows, assert URL param and optional legacy path param round-trip.

2. **Sub-step D3b — Remove dashboard tab:**
   - **[EXPANDED] Lifecycle verification (pre-flight):** `useMessageSubscription()` is invoked at the app root in [App.tsx:201](../apps/myk9show/src/App.tsx:201), not from the dashboard. Removing `MessagesTab` cannot starve the sidebar unread badge. **No sidebar code needs to change.** This is a fact, not a TODO — the verification is already done; the plan step is just confirming the test asserts the badge still renders post-removal.
   - `SecretaryDashboardPage/index.tsx`: drop the tab bar entirely if Tasks is the only remaining tab (it will be — Messages is the second tab today). Remove `activeTab` state, the `tabs` array, `useMessageStore` import, `MessagesTab` import. Render TasksTab directly without tab chrome.
   - Delete `MessagesTab.tsx` and `MessagesTab.test.tsx`.
   - Sidebar test: confirm the unread badge still reflects `useMessageStore(s => s.unreadCount)` post-removal (no code change expected, test is the lock-in).

3. **Sub-step D3c — Wire any "deep-link" entry points:**
   - Any place that previously linked to `/secretary/dashboard?tab=messages` (search for it) now links to `/secretary/messages`. Likely zero hits, but verify.

**[ADDED] Rollback strategy:** If D3b stalls or regresses, D3a is independently valuable — the dedicated page gets a useful filter regardless. Ship D3a first as its own PR, observe for a day, then ship D3b. Do NOT bundle the two into one PR even though they're conceptually one phase.

**Tests:**
- `SecretaryMessagesPage.test.tsx`: filter behavior, URL persistence.
- Route/sidebar tests: `/secretary/messages` reaches `SecretaryMessagesPage`; sidebar behavior matches the decision above.
- Dashboard page test: assert no tab bar, no MessagesTab.
- Sidebar test: badge still reflects unread count from `useMessageStore` (data source unchanged).

**Acceptance:**
- Dashboard renders Tasks content directly with no tab bar.
- `/secretary/messages` is reachable, has the show-filter, and supports `?showId=` deep-links.
- `git grep MessagesTab` returns nothing under `apps/myk9show/`.

---

### D4 — Lock in `AttentionNeededStrip` as navigation-only (verification + framing pass)

**[EXPANDED] Premise correction (2026-05-24):** The stub plan assumed `AttentionNeededStrip` had in-place actions to demote. Audit confirmed it does NOT — every item is already a `<Link>` (see [AttentionNeededStrip.tsx:22-42](../apps/myk9show/src/pages/secretary/SecretaryDashboardPage/AttentionNeededStrip.tsx#L22-L42)). D4 therefore narrows from "remove in-place actions" to "lock in the nav-only contract with a regression test + a small framing pass on copy."

**Why fourth:** highest-visibility surface, but smallest functional change. Saved for last so the rest of the dashboard refocus is already settled and any visual regression is isolated.

**Scope:**
- **[EXPANDED] Regression test (primary deliverable):** add `AttentionNeededStrip.test.tsx` (or extend an existing one) asserting that every rendered item is a navigation surface — no `onClick` mutation handlers, no buttons that trigger mutations, only `<Link>` or equivalent nav primitives. This pins the contract: any future contributor who adds an in-place action to the strip will see this test fail and have to make an explicit choice.
- **Framing pass (copy only):** review the strip's header copy ("Needs attention") and item text shape. If any item text reads imperatively ("Approve 3 entries"), reframe to indicative ("3 entries awaiting approval"). Tone shift: "where to go" not "act here."
- **[ADDED] Empty state:** strip already returns `null` when `items.length === 0` (verified). No change needed; just confirm the existing behavior in the test.
- **[ADDED] `useMyShows` upstream:** verified to return items with `kind | text | href | showName | showId` shape — no upstream code change needed.

**Tests:**
- New regression test: every strip item is a `<Link>` or navigation primitive; no mutation handlers attached.
- Existing dashboard structural tests must still pass.

**Acceptance:**
- Regression test in place — future "add an action to the strip" PRs will be caught by CI.
- Copy reframed (if any imperative phrasing was present).
- No functional change to the strip's data flow or rendering.

---

### D5 — Tests + cleanup pass

**Why last:** a sweep after the four substantive PRs land. Catches accumulated debt — dead imports, stale comments, orphan helpers, outdated copy.

**Scope:**
- Grep for `useSearchParams` on the dashboard page — should be gone if D2 removed it cleanly.
- Grep for any helper functions, types, or constants in `SecretaryDashboardPage/` that became unused after D1–D4 deletions. Delete.
- Audit `useMyShows` and `attentionByShow` derivation in `index.tsx` — confirm still needed.
- **[EXPANDED] `docs/INTENT.md` update with explicit framing.** The post-refocus dashboard's emotional intent is: **"a calm cross-show home — I can see all my shows at once, spot anything cross-show that needs my attention, and land in the right place to actually do the work."** It is explicitly NOT an operational surface; operational work lives in Show Desk. Add this framing as a new or updated paragraph; check that no `// INTENT:` comments in the affected components contradict it.
- Add a top-level dashboard component-test that asserts the post-refocus structure: header, AttentionNeededStrip, MyShowsSection list, personal Tasks block, nothing else.
- **[ADDED] End-to-end integration test (or thorough page-level test):** mount `SecretaryDashboardPage` with seeded data covering (a) zero shows, (b) one show with a per-show task, (c) personal task + per-show task — assert the dashboard renders only the cross-show + personal slices; assert per-show task appears in Show Desk Tools sheet not the dashboard. This is the test that proves the refocus story end-to-end, not just per-phase units.
- Update CLAUDE.md or sprint docs if any per-show task/messaging instructions reference the dashboard.

**Acceptance:** no dead code under `SecretaryDashboardPage/`; `docs/INTENT.md` reflects new scope with the framing above; top-level structural test pins the surface; integration test proves the cross-show / per-show split.

---

## Phase ordering rationale

| Phase | Risk | Why this order |
|---|---|---|
| D1 | None | Pure deletion of orphan; confirms test infra. |
| D2 | Low | Tasks duplicate is the clearest; secretary keeps the capability via Show Desk. |
| D3 | Medium | Two-step: must augment dedicated page first, then remove. **D3a and D3b ship as separate PRs** — D3a is independently valuable and D3b is a clean revert if it regresses. |
| D4 | Low *(downgraded after audit)* | Originally believed high-risk based on assumption of in-place actions. Audit confirmed strip is already nav-only; D4 is now a verification + framing pass. Still last because it's the most-visible surface. |
| D5 | None | Sweep + intent doc + integration test; no behavior change. |

**[ADDED] Per-phase rollback:** every PR is independently revertable via `git revert`. The only ordering constraint is D3a-before-D3b (capability preservation). D1, D2, and D4 have no inter-dependencies — could ship in any order if priorities shift.

## What we are NOT doing

- **No route changes.** `/secretary/dashboard` stays. The PO question about merging into `/secretary` is answered: no, the dashboard remains the home when no show is selected.
- **No backwards-compat shims for old dashboard tab URLs.** Per pre-launch status, old URLs like `/secretary/dashboard?tab=messages` may load the dashboard with ignored params; no redirect shim is needed. The exception is `/secretary/messages/:showId?`, which already exists as a parked route and is handled in D3a.
- **No restyling pass on `MyShowsSection`.** Tempting, but out of scope. If the phase sections need an IA refresh, that's a separate plan after observing post-refocus usage.
- **Minimal Show Desk changes only.** This plan ends at the dashboard's edges. Show Desk's adaptive header remains unchanged; `TasksNotesCard` only gets the D2 link-target update.

## PO answers locked

| Question | Answer |
|---|---|
| What stays? | My Shows sections, ShowPhaseCard nav, AttentionNeededStrip (demoted), personal tasks (show_id IS NULL), header/greeting |
| What gets removed? | MessagesTab, EntriesTab orphan, per-show task scoping on TasksTab |
| What gets demoted? | AttentionNeededStrip → navigation-only (D4) |
| Does the route change? | No. `/secretary/dashboard` stays. No merge into `/secretary`. |
| Is the Messages tab worth keeping? | No — delete; dedicated `/secretary/messages` page absorbs it (D3a adds the show-filter the dashboard tab provided). |

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-05-22 | Stub created during Option B planning session. Dashboard refocus identified as logical follow-up. Full plan deferred until post-Option-B data was available. | Stub plan, original session |
| 2026-05-24 | Pre-launch status (per [project_prelaunch_no_users](../.claude/projects/.../memory/project_prelaunch_no_users.md)) means the "observation period" gate never trips. Audit data + PO answers substitute. Full plan drafted now. | This session |
| 2026-05-24 | Three duplicate surfaces identified (Tasks, Messages, dead EntriesTab) plus one demotion target (AttentionNeededStrip). Scope confirmed: all three + demotion. | This session (user confirmed) |
| 2026-05-24 | Dedicated `/secretary/messages` page gets a show-filter dropdown before dashboard MessagesTab is removed, so secretaries don't lose per-show scoping. | This session (user confirmed) |
| 2026-05-24 | No route change. Dashboard stays at `/secretary/dashboard`. | This session (user confirmed) |
| 2026-05-24 | Phased into D1–D5 (dead code → low-risk duplicate → medium-risk duplicate w/ pre-work → demotion → cleanup). | This session |
| 2026-05-24 | **Verify-plan pass:** D4 premise corrected (strip is already nav-only — D4 narrows to verification + framing). D2 link target locked to no-param. D3 lifecycle question resolved (App.tsx triggers subscription, not dashboard). Empty states + error handling added to D2/D3a. Integration test added to D5. INTENT.md framing made explicit. | This session |
| 2026-05-24 | **Review pass:** D3 route premise corrected (`/secretary/messages/:showId?` is currently parked behind a dashboard redirect), D2 expanded to remove show assignment from dashboard task create/edit paths, Tasks badge narrowed to personal open tasks, and validation metadata added. | This session |
