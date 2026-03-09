# Club Admin Phase 2 — Club Management MVP

## Goal

Establish club management as a product vertical. Club admins manage membership (organizational roles like president, full member, etc.) and see their club's shows via a filtered browse page. Data model designed for future expansion (dues, terms, elections).

## Scope

### 1. Database: `club_members` + `club_officers` tables

**`club_members`** — membership roster

- `id`, `club_id` (FK clubs), `person_id` (FK people)
- `membership_type`: full, associate, junior, honorary
- `membership_status`: active, lapsed, suspended, resigned
- `joined_date`, `dues_paid_through` (nullable, future use)
- `voting_eligible` (boolean, derived from type but overridable)
- RLS: club admins + site admins can CRUD for their club; members can read their own

**`club_officers`** — governance positions

- `id`, `club_id` (FK clubs), `person_id` (FK people)
- `position`: president, vice_president, secretary, treasurer, board_member
- `term_start`, `term_end` (nullable for indefinite)
- `elected_date` (nullable)
- RLS: same as club_members

Note: These are separate from `user_roles` (app permissions). A club president gets `CLUB_ADMIN` app role but their _title_ is "President".

### 2. Club filter on Browse Shows

- Add `club` field to `ShowFilters` interface (default: `'all'`)
- Add "Club" `FilterDefinition` with options from unique club names in show data
- Filter: `show.clubId === filters.club`
- Support `?club=<clubId>` URL param for deep-linking from sidebar
- Read `club` param on mount, pre-populate filter

### 3. Sidebar: "My Club" group

Add to `buildUnifiedSidebarConfig` when user has `CLUB_ADMIN` role:

- Extend function to accept optional `clubContext?: { clubId: string; clubName: string }`
- Add "My Club" nav group:
  - "Our Shows" → `/shows?club=<clubId>`
  - "Members" → `/club-admin/members`
  - "Club Profile" → `/clubs/<clubId>`

### 4. Club Members page (`/club-admin/members`)

- Auto-detect club from user's scopes (`getUserAdminClubs()` or query `user_roles`)
- Club picker at top if multi-club admin
- **Members tab**: table with name, email, membership type badge, status badge, joined date, actions
- **Officers tab**: table with name, position, term dates
- Actions: add member (person picker), change membership type, change status, remove
- Officer actions: assign position, set term dates, remove position

### 5. Tests

- Migration: verify tables created with correct columns
- Club filter: unit test for filter logic in `useBrowseShowsFilters`
- ClubMembersPage: component tests for render, add/remove, role changes

## Implementation Order

1. Migration (club_members + club_officers tables)
2. Types + queries + mappers for new tables
3. Club filter on Browse Shows
4. Sidebar config changes
5. ClubMembersPage + routes
6. Tests

## Non-Goals (deferred)

- Dues collection / payment integration
- Election management / term limit enforcement
- Member communications / announcements
- Automatic app role grants based on officer position (keep manual for now)
