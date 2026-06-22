# Plan — IA Remediation: Secretary Entry Management

> **Status:** Active

**Date:** 2026-06-21
**Scope:** Execute the Critical + High findings from [`docs/ia-review-secretary-entry-management.md`](ia-review-secretary-entry-management.md). This is the **cognitive-load track** for `pages/secretary/EntryManagementPage.tsx` + `components/entries/management/**`. Theming (chip tokens) was already fixed in PR #893 and is out of scope here.
**Companion findings doc:** [`docs/ia-review-secretary-entry-management.md`](ia-review-secretary-entry-management.md) — read it first; it holds the route audit, severity scoring, and the rationale each phase below references by finding ID (F1–F7).

## Product decisions (resolved 2026-06-21)

These three were the genuine IA decisions gating this plan. Per `CLAUDE.md` ("state the duplication question explicitly"), they were resolved before any code:

| # | Decision | Choice |
|---|----------|--------|
| F1 | Trial→class→scoring drilldown | **Demote to filters + deep-link.** Trial/class filter the list in place; roster is an explicit toggle, not a derived mode; "Score a class" is an explicit deep-link to the dedicated `/scoring` (or `/at-show`) surface. Scoring leaves this page. |
| F2 | Move-ups / Pulled | **De-disguise in place.** Lift them out of the status-filter chip row into a clearly-labeled "Exceptions" surface (sub-tab/secondary nav). No new routes. Status chips revert to pure status filters. |
| F3/F5 | Overloaded menus | **Group within one menu.** Keep one menu per row, split into Lifecycle / Money / Destructive sections with headers + separators. |

## How to use this doc

- Phases are ordered by **risk and dependency**, not by severity: the free win lands first; the architectural change (F1) lands last so smaller wins ship independently.
- Each phase has an **entry trigger** and an **exit criterion**. A phase is not done until its tests are written and green (`CLAUDE.md`: every plan includes a testing phase).
- One PR per phase unless noted. Open each PR from the worktree; merge from the main checkout (`CLAUDE.md` worktree rules).

## Architectural commitments these phases must respect

1. **Immovable INTENT locks — do not remove or weaken:**
   - `EntryListCard.tsx:263-268` — no "Waitlisted" status option (waitlisting is per-class via `waitlist_entries`).
   - `EnrollmentCard.tsx:329-336` — no "Waitlist All" bulk option (same reason).
   - `EntryFiltersCard.tsx:32-44` — the no-second-status-control guard. This file is being **deleted** in Phase A; the note must be **migrated**, not lost.
2. **at-show owns scoring.** Per `project_atshow_route_shape` / `project_atshow_gating_map`, ringside scoring lives at `/at-show/:showId/...`; the paper scoresheet lives at `/scoring/...`. Phase D deep-links to these — it must not reimplement scoring on the entries page.
3. **Replication-backed reads stay replication-backed.** Entries/classes are per-show replicated (`project_replication_sync_scopes`). Phase D's deep-link must not introduce a direct PostgREST read on a core offline flow.
4. **Preserve the role's target feeling** (`docs/INTENT.md`) — the secretary surface should feel *in control and unsurprised*. Every phase here removes a surprise; none should add one.

---

## Phase A — Delete the orphan filter component (free win)

**Status:** ✅ Implemented in PR #901 (pending merge).
**Finding:** F6. **Risk:** none. **Est:** 1 PR.

**Entry trigger:** Now. Independent of all other phases.

**Scope:**
- Delete `components/entries/management/EntryFiltersCard.tsx`.
- Delete its two tests: `test/components/entries/management/EntryFiltersCard.test.tsx` and `EntryFiltersCard.integration.test.tsx`.
- Remove the barrel export `components/entries/management/index.ts:10`.
- **Migrate the INTENT note** (`EntryFiltersCard.tsx:32-44` — "entry status is filtered exclusively by the attention row; this surface deliberately carries no second status control") into `entryManagementFilters.ts`, as a comment on `ENTRY_MANAGEMENT_FILTERS`. This is the live filter system; the guarantee must travel to it.

**Why first:** It is zero-risk dead-code removal, and confirming the live filter system is `ListControls` + `ENTRY_MANAGEMENT_FILTERS` (not `EntryFiltersCard`) de-risks every later phase that touches filters.

**Exit criterion:** `EntryFiltersCard` and its tests gone; barrel updated; INTENT note present in `entryManagementFilters.ts`; `pnpm typecheck` + `pnpm lint` clean; entry-management test suite green.

---

## Phase B — De-overload the row action menus

**Status:** ✅ Implemented in PR #901 (pending merge). Status menu grouped (status block / quiet "Payment" header with `CreditCard` cues / separated destructive Remove); payment menu grouped into Mark paid / Adjust / Reset. Implementation note: Base UI `DropdownMenuLabel` (`MenuGroupLabel`) **must** be wrapped in a `DropdownMenuGroup` or it throws `MenuGroupContext is missing` — each labeled section is wrapped accordingly.
**Findings:** F3 (status menu, `EntryListCard.tsx:252-314`), F5 (payment menu, `EnrollmentCard.tsx:242-280`). **Risk:** low (presentation only — no behavior change). **Est:** 1 PR.

**Entry trigger:** Phase A merged (avoids two PRs touching the same files in parallel).

**Scope:**
- **Status menu (`EntryListCard`)** → one menu, three labeled sections:
  - *Lifecycle:* Pending · Accepted · Not Accepted · Missing Info · Withdrawn · Pulled
  - *Money:* Request payment… · Refund payment… (existing conditional visibility unchanged)
  - *Destructive:* Remove entry (keep `text-destructive`)
  - Use shadcn `DropdownMenuLabel` + `DropdownMenuSeparator`. The "Waitlisted" omission (`:263-268`) stays.
- **Payment menu (`EnrollmentCard`)** → one menu, grouped:
  - *Mark paid:* Cash · Check… · Online
  - *Adjust:* Partial Payment… · Refunded… · Partial Refund…
  - *Reset:* Payment Due
- No handler/wiring changes — purely structural grouping. Same `onClick`s, same dialogs.

**Why second:** Pure presentation, no state-model change. Lands a visible cognitive-load win while the harder structural phases (C, D) are still being designed.

**Exit criterion:** Both menus render labeled sections; no behavior change (verify each `onClick` still fires its existing dialog/handler); component tests assert section grouping + that money/destructive items remain present and correctly gated; suite green.

---

## Phase C — De-disguise Move-ups & Pulled into an "Exceptions" surface

**Status:** ✅ Implemented (pending PR). Decision: a **third top-level tab** `Entries | Exceptions | Waitlist` with a Move-ups/Pulls sub-switch (`ExceptionsView`, synced to `?tab=exceptions&queue=…`). Status chips reverted to pure filters (`move-ups`/`pulled` removed from the attention enum, options, and `useEntryManagementFilters`). Legacy `?attention=move-ups|pulled` and `?entryTab=move-ups|scratches` bookmarks migrate to the Exceptions tab via the `normalizeEntryManagementSearchParams` rewrite (idempotent; unit-tested). `RegistrationView` no longer renders the surface-swap branches; its `showId` prop was dropped.
**Finding:** F2. **Risk:** medium (moves two surfaces out of the filter row). **Est:** 1–2 PRs.

**Entry trigger:** Phase A merged. Independent of B and D.

**Scope:**
- Remove `move-ups` and `pulled` from the **status-filter chip row** (`ENTRY_MANAGEMENT_FILTERS` attention options in `entryManagementFilters.ts:48-61`). The attention chips revert to pure status filters: All / Pending / Accepted / Waitlist / Issues.
- Introduce an **Exceptions** surface that visibly signals "different concern" — a secondary nav/sub-tab inside the Entries tab (e.g. `Entries · Exceptions ▾ · Waitlist`, or a labeled segmented control above the list). It hosts `MoveUpRequestsTab` and `PullManagementTab` (their internals are untouched).
- Preserve deep-linkability: keep a URL param so `?exceptions=move-ups` / `?exceptions=pulled` (or equivalent) still restores the view. **Add a legacy redirect** from the old `?attention=move-ups` / `?attention=pulled` params (the `legacyEntryTabToAttention` normalizer at `entryManagementFilters.ts:87-101` already models this pattern — extend it) so existing links/bookmarks don't break.
- `RegistrationView.tsx:260-271` no longer branches on `attention === 'move-ups' | 'pulled'`; that conditional moves to the new Exceptions host.

**Why de-disguise, not promote (F2 decision):** the consolidation phase (`CLAUDE.md`) is reducing surface area, not adding routes. These surfaces stay embedded; the fix is to stop dressing a surface-swap as a filter.

**Exit criterion:** Move-ups/pulled no longer appear as attention chips; the Exceptions surface renders both sub-apps and visually reads as a distinct area; old `?attention=move-ups|pulled` links redirect to the new location; `getEntryManagementEmptyStateMessage` and `normalizeEntryManagementSearchParams` updated + unit-tested for the new param shape; suite green.

---

## Phase D — Make the trial/class drilldown honest (filters + deep-link)

**Status:** ✅ Implemented (pending PR). The derived `viewMode` no longer produces `scoring` or auto-`roster`: trial/class are now in-place filters on the entry list (the page passes the trial's class ids into `useEntryManagementFilters`), **Roster is an explicit `?roster=1` toggle**, and scoring is an explicit **"Score this class →" deep-link** (`TrialScopeBar`, a real `<a>` to `/scoring/classes/:classId/entries`) — `ScoringModeWrapper`'s redirect-on-render is deleted. F4: `EntryWorkModeSwitch` is relabeled "Quick views" so it reads as a preset, not a fourth axis. **Live walk:** deferred — the Preview MCP serves `main` in a worktree session and a full playwright drive needs a seeded show + login; behavior is covered by unit tests (no `/scoring` redirect on class select, roster toggle, deep-link href, in-place filtering). Recommended as a manual pre-merge check on staging.
**Findings:** F1 (Critical) + F4 (workMode legibility). **Risk:** high (changes the page's derived state model). **Est:** 1–2 PRs.

**Entry trigger:** Phase C merged (avoids reshaping the content area twice). This is the architectural core — it goes last on purpose.

**Scope:**
- **Kill the derived `viewMode` redirect chain.** Replace `useEntryManagementFilters.ts:161-165` (`trial+class ⇒ scoring`, `trial ⇒ roster`) so that:
  - Trial/class selections **filter the registration list in place** (they stop silently reshaping the page).
  - **Roster** becomes an **explicit toggle** (e.g. a `[List | Roster]` segmented control shown once a trial is selected), rendering `TrialRosterView` only when the user asks for it — not as a side effect of picking a trial.
  - **Scoring leaves this page.** Replace the `viewMode === 'scoring'` branch + `ScoringModeWrapper` redirect-on-render (`EntryManagementPage.tsx:421-428`) with an explicit **"Score this class →"** deep-link button (a real `Link`/`navigate`, visible and labeled) that targets the dedicated scoring surface. `ScoringModeWrapper`'s redirect role is retired; if nothing else uses it, delete it.
- **F4 — make `workMode` legibly a preset, not a hidden macro.** Label `EntryWorkModeSwitch` so it reads as a shortcut ("Quick views: Review · Day-of") and ensure it visibly reflects/sets the filters it writes, so the user understands it's rewriting attention/payment/view rather than being a fourth independent axis.
- Audit the now-simpler state model: with scoring gone and roster explicit, the page's only real axes are `pageTab`, attention/payment/search filters, `entryViewMode` (table/cards), and the roster toggle — all honest. Update the `viewMode` type/return in `useEntryManagementFilters` accordingly (it likely narrows to `registration | roster`).

**Why last:** It is the highest-risk change (touches the URL-driven state model and a redirect), and it benefits from Phases A–C having already simplified the surrounding surface. Per F1's decision and architectural commitment #2, scoring is **deep-linked, not reimplemented** — at-show/`/scoring` keep ownership.

**Exit criterion:** selecting a trial no longer auto-switches the page; roster is reachable only via the explicit toggle; "Score this class" is a visible deep-link (no silent redirect); `workMode` visibly reads as a preset; `useEntryManagementFilters` unit tests cover the new (trial filters in place / explicit roster) behavior and assert no redirect fires on class selection; `pnpm typecheck` + suite green; **a live walk** (playwright-test MCP or qa-feature against a seeded show + secretary login) confirms the trial→class flow no longer surprises the user.

---

## Testing summary (per `CLAUDE.md` — every plan has a testing phase)

| Phase | New/updated tests |
|-------|-------------------|
| A | Remove `EntryFiltersCard` tests; assert (manually/typecheck) no dangling imports. Confirm `entryManagementFilters` tests still green. |
| B | `EntryListCard` + `EnrollmentCard` component tests: section grouping present; every money/destructive/lifecycle action still fires its handler; conditional gating (`isPaymentRequestable`, `isStripeRefundable`) preserved. |
| C | `normalizeEntryManagementSearchParams` + `getEntryManagementEmptyStateMessage` unit tests for the new Exceptions param; legacy `?attention=move-ups\|pulled` redirect test; `RegistrationView` test that attention chips no longer include move-ups/pulled. |
| D | `useEntryManagementFilters` unit tests: trial filters list in place, no `scoring` redirect on class select, roster only via explicit toggle; assertion-first test that picking a class does **not** call `navigate` to `/scoring`. One live walk. |

Use the custom render from `src/test/utils/testUtils.tsx`. Assertion-first for the F1 "no silent redirect" guarantee (`CLAUDE.md` value-sensitive-bug rule): write the `expect(navigate).not.toHaveBeenCalledWith('/scoring/...')` line red first.

---

## Phase summary

| Phase | Scope | Entry trigger | Exit criterion | Est. PRs |
|-------|-------|---------------|----------------|----------|
| A | Delete orphan `EntryFiltersCard`, migrate INTENT note | Now | File + tests gone; note migrated; suite green | 1 |
| B | Group the 9- and 7-item menus into Lifecycle/Money/Destructive sections | A merged | Sections render; zero behavior change; tests green | 1 |
| C | Move move-ups/pulled out of filter chips into an "Exceptions" surface | A merged | Chips are pure filters; Exceptions surface live; legacy links redirect | 1–2 |
| D | Trial/class filter in place; roster explicit; scoring deep-linked; workMode legible | C merged | No silent redirect; honest state model; live walk passes | 1–2 |

**Total:** 4–6 PRs across 4 phases. Phase A is shippable immediately.
