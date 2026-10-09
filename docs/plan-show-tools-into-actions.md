# Plan: fold the show page Tools slide-out into the header Actions menu

> **Status:** Active

Owner-approved direction (2026-10-09), held until after the Oct 10 test show on the planner's advice: the change touches the app-wide header and the action registry on the secretary's show-day surface, and it could not be browser-walked in the run that planned it (the in-app browser was not signed in). Tracked on MYK9-1085 (ledger). Rule it serves: [`docs/INTENT.md`](INTENT.md) § "Dialog or Slide-Out: Decision vs Work" ("a slide-out holds one thing; the menu is the index").

## Target design

- The header **Actions** menu gets two sections, **Show day** and **Show logistics**; each show tool is a row (People at show, Self check-in, Access codes; Volunteers, Judge hospitality, Tasks and notes, Incident log; plus any others in the tools array).
- Choosing a row opens the existing right slide-out showing **only that tool**. No accordion list.
- The attention badge (urgent / routine / unknown tones from `computeShowDeskActionable`) moves onto the Actions button, with per-tool counts on rows (`attentionLabel`).
- The separate **Tools** button on the show page is removed.

Duplication question: this removes the second door to the same job (Tools button next to Actions) rather than adding a surface.

## Architecture (from a code read, 2026-10-09)

- **Rows come from the page.** `features/actions/pageEditTarget.ts` is already a zustand store that pages use to hand items to the header (`usePageEditAction`, `usePageExportAction`; `useCurrentActions` reads it). Add a `showTools` slice: per-tool `{ id, group, title, attentionLabel? }` (no `content`) plus `attention: { count, tone, incomplete }`, with the usual owner symbol so a stale cleanup cannot wipe a newer registration. A `useShowDeskToolsRegistration(tools, actionable)` hook is called from `pages/secretary/ShowWorkbenchShowDeskPage.tsx` next to `showDeskTools` and `actionable`. The JSX `content` stays in the page.
- **Rows are links.** Each row is an `AppAction` with `href: '?tool=<id>'`; `useCurrentActions` already merges search-only links into the current params, and `cockpitRoutes.ts` already keeps `tool` when the cockpit rewrites the URL. The command palette gets the tools for free.
- **Two sections.** Extend `ACTION_GROUP_ORDER` (`actionRegistry.ts`) with `show-day` and `show-logistics`, headings in `useCurrentActions`, icons in `actionIcons.ts`; move `SHOW_DESK_TOOL_GROUPS` into the registry.
- **Badge.** Move the badge logic out of `ShowDeskToolsSheet.tsx` into a shared `ActionableBadge`; `HeaderActions.tsx` renders it on the trigger (icon-only below `sm`; `header-wordmark-fits.spec.ts` guards overflow). Rows show `attentionLabel` through one new optional `badge` field on `AppAction`.
- **Offline-first.** Do not recompute counts in the header. Counts already come from the page (incidents via `useQuery`, tasks via `useSecretaryTasks`, hospitality from localStorage); lifting them changes nothing about how they are read. The `incomplete` flag and the `?` badge pass through unchanged. The badge exists only while the show page is mounted, same as the Tools button today.
- **Permissions.** Register only when `scope.status === 'resolved' && scope.canManage` (the same gate as `useCurrentActions`), so a row never appears and then vanishes. Volunteers keeps its `secretaryOnlyReason` inside its content; no new gating.

## The sheet becomes a one-tool panel

Rewrite `ShowDeskToolsSheet.tsx` as `ShowDeskToolPanel({ tools })`: open when `?tool=<id>` matches a tool; close (X, Escape, outside click) deletes the param with `replace: true`; opening from a menu link pushes history so Back closes it. Header is the tool title plus summary; body is that tool's `content`; `data-layout` is `wide` only when the tool's `layout === 'wide'`. An unknown id stays closed.

Delete: `showDeskToolsState.ts` and its test, `defaultOpen`, the Collapsible list, `toolStateSignature` and the keyed remount, the `show-desk-tools:<id>` localStorage key, and the stale comment in `features/at-show/atShowClassListState.ts`.

## Tests and locators that depend on this

- `features/show-map/__tests__/ShowDeskToolsSheet.test.tsx` (almost every case; trigger/badge cases move to a `HeaderActions` test, accordion/persistence cases are deleted).
- `test/e2e/entities/secretaryShowWorkbenchUI.spec.ts` (lines ~76, 90, 124, 129-130) and `test/e2e/qa/roleJourneyVisualQa.spec.ts:138`: `getByRole('button', { name: /^Tools/ })`.
- `?tool=` URL contract unchanged for `entry-management-cockpit.spec.ts`, `disposable-entry.spec.ts`, `noRetiredClassManagementLinks.test.ts`, `showSectionRedirects.test.tsx`, `cockpitRoutes.test.ts`, and `peopleRosterRoutes.ts` (`people-at-show`).
- Header and actions tests in `features/actions/__tests__`: new group ids and badge.

## Staged PRs (one per stage, each independently verifiable)

1. **Single-tool panel driven by `?tool=`**, Tools button kept (it becomes a short list of links that set `?tool=`). Deletes the accordion and persisted state. Browser walk as `secretary@myk9t.com`.
2. **Store registration, the two menu sections, trigger and row badges.** Header tests plus a browser walk at 375px and desktop.
3. **Remove the Tools button** and the badge props from `ShowDeskPanel`; update the two e2e locators to `header-actions-trigger` plus `header-action-<id>`.

## Risks

- The icon-only header at 375px loses room; the wordmark spec guards it.
- Adding group ids touches every caller of `ActionGroupHeadings`.
- Today an incident's `attentionLabel` makes its section open by default; that behavior is replaced by the row badge.
- Close and Back behavior on mobile.

## Testing phase

Each stage is complete only when: `pnpm typecheck`, lint, the touched vitest files, a shuffled full run and `pnpm qa:code-quality-ratchet` pass; the e2e locators above are updated and green; and a signed-in browser walk of the show page (secretary account, 375px, 768px, desktop) is recorded on the issue.
