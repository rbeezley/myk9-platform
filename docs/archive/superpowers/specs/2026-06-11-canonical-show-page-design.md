# Canonical Show Page Design

Date: 2026-06-11
Status: Approved design direction, pending implementation plan

## Problem

myK9Show currently has two show-level experiences:

- `/shows/:id` for the public or exhibitor-facing show details page
- `/secretary/shows/:showId` for the secretary workbench

For secretaries, this creates a split mental model. The same show can feel like two places: a public preview and a workbench. Manager controls have also drifted onto both surfaces, which makes it unclear where a secretary should look for show actions.

This duplicates an existing page. There is no strong product reason to keep two show-detail surfaces when role-aware controls can serve the same goal with less cognitive load.

## Goal

Make `/shows/:id` the single canonical show page. The page should always answer, “What show am I looking at?” Role and permissions decide what the user can see and do.

This supports the fall 2026 launch-readiness goal: reduce secretary confusion during show setup and show-day work while keeping the exhibitor experience simple.

## Non-Goals

- Do not remove the exhibitor/public show experience.
- Do not rebuild secretary workflows as new isolated surfaces.
- Do not merge all route code into one large file.
- Do not change ringside, scoring, or myK9Q behavior.
- Do not change offline-first data paths.

## User Model

### Public or Unauthenticated Visitor

The user sees a public show page with overview information, trial/class browsing, results, and clear entry actions when entries are open.

### Exhibitor

The user sees the same show page plus entry-aware actions such as enter, manage entry, view entry, and show-day information relevant to their dogs.

### Secretary or Admin

The user sees the same show identity plus a management layer:

- Setup
- Show Desk
- Entry Management
- Reports
- Results Control
- Submit Results

The top-right card action standard applies here: show status and the 3-dot show menu live at the top-right of the show card.

## Recommended Architecture

### Canonical Route

`/shows/:id` becomes the canonical show route for every role.

The route shell owns shared show identity:

- show hero card
- status and role-aware actions
- role-aware navigation
- shared loading, error, and not-found states
- `ShowPresenceProvider` when needed

The shell delegates content to focused child routes or components.

### Role-Aware Navigation

The canonical page renders different navigation based on permissions.

Public/exhibitor navigation stays read-oriented:

- Overview
- Trials
- Classes
- My Entries when authenticated and relevant
- Results

Secretary/admin navigation adds management sections:

- Setup
- Show Desk
- Entry Management
- Reports
- Results Control
- Submit Results

The management sections should not appear as a second page family. They are capabilities inside the canonical show page.

### Secretary Section Ownership

Existing secretary section components move behind the canonical route without losing their boundaries.

The implementation preserves the current purpose of these sections:

- Setup owns pre-show readiness and publishing materials.
- Show Desk owns day-of operations and the Show Map.
- Entry Management owns entry review and bulk entry work.
- Reports owns printing and export.
- Results Control owns visibility and result release controls.
- Submit Results owns registry submission.

This keeps files small and avoids turning `ShowDetailsPage` into a catch-all.

## Routing Plan

### Canonical New Paths

- `/shows/:id`
- `/shows/:id/setup`
- `/shows/:id/show-desk`
- `/shows/:id/entry-management`
- `/shows/:id/reports`
- `/shows/:id/results-control`
- `/shows/:id/submit-results`

The default section is explicit:

- `/shows/:id` renders the overview for every role.
- Secretary/admin users see management controls and management navigation on that overview.
- Links from secretary-owned surfaces may target a management section directly when the user intent is specific, such as `/shows/:id/show-desk`.

### Legacy Secretary Paths

Old secretary routes become redirects:

- `/secretary/shows/:showId` -> `/shows/:showId/setup`
- `/secretary/shows/:showId/show-desk` -> `/shows/:showId/show-desk`
- `/secretary/shows/:showId/entry-management` -> `/shows/:showId/entry-management`
- `/secretary/shows/:showId/reports` -> `/shows/:showId/reports`
- `/secretary/shows/:showId/results-control` -> `/shows/:showId/results-control`
- `/secretary/shows/:showId/submit-results` -> `/shows/:showId/submit-results`

Redirects preserve query strings such as selected reports, filters, and class IDs.

## Access Rules

Public and exhibitor sections remain accessible according to current rules.

Secretary-only sections require secretary/admin access. If a non-manager opens a secretary section URL, the app redirects to `/shows/:id`. If the user reaches a protected management tool through an in-app action despite lacking access, the app shows a calm unauthorized state.

## Data Flow

The canonical shell loads the show once and passes shared show identity down. Section components continue to use their existing hooks where those hooks own section-specific data.

Core show-day reads and mutations must continue to use replication-backed paths where offline reliability requires it.

No new data model is required for this consolidation.

## UI Behavior

### Show Hero

The hero card is shared across roles.

For public/exhibitor users:

- show identity
- organization/status badges relevant to entry
- entry CTA when applicable

For secretary/admin users:

- show identity
- status badge at top-right
- 3-dot show menu at top-right
- management navigation below the hero

### Preview Concept

“Preview public page” disappears as a primary concept once `/shows/:id` is canonical. A secretary is already on the show page. If a true unauthenticated preview is still needed, it lives in the overflow menu as “View as public,” not as a competing destination.

## Testing

Implementation includes:

- route redirect tests for old `/secretary/shows/:id/*` paths
- role-aware nav tests for public, exhibitor, and secretary users
- regression tests that secretary show actions render in the canonical hero top-right
- query-string preservation tests for reports and management subroutes
- focused section tests proving existing secretary pages still render under the canonical route
- typecheck and targeted lint for touched files

Browser smoke covers one seeded secretary show and one public/exhibitor show path.

## Migration Strategy

Build this in small slices:

1. Create the canonical role-aware show route shell.
2. Mount secretary navigation and one low-risk secretary section under `/shows/:id`.
3. Add redirects from matching legacy secretary routes.
4. Move the remaining secretary sections one by one.
5. Remove duplicate manager controls from any leftover public-only layer.
6. Update documentation, route registry, and tracking files.

Each slice is releasable and tested.

## Default Section Decision

Keep `/shows/:id` as the overview for every role. This preserves the public URL and keeps the show identity page stable.

Secretary-specific entry points target the section that matches intent:

- setup links target `/shows/:id/setup`
- show-day or active-show links target `/shows/:id/show-desk`
- reports links target `/shows/:id/reports` with existing query parameters preserved

Do not add dynamic default routing in the first implementation. It adds hidden behavior before the route model is stable.
