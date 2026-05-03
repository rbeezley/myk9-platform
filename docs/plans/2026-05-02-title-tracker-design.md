# Design: AKC Scent Work Title Tracker

**Date:** 2026-05-02  
**Status:** Approved — ready for implementation planning  
**Route:** `myk9show.com/titles`  
**App:** `apps/myk9show` (existing app, new exhibitor-scoped section)

---

## 1. Overview

A standalone-feeling section of myK9Show where AKC Scent Work exhibitors can track their dogs' qualifying legs and title progress. Exhibitors sign up for a myK9Show account, add their dogs, and manually log qualifying scores. The app computes title progress in real time.

**Why build it now:** Gives exhibitors real value while myK9Show is still in development. When myK9Show is complete, the data is already there — dogs, scores, and history migrate automatically because they live in the same shared database.

**Design principle:** Exhibitors who sign up for the title tracker only see the title tracker. The half-finished secretary and admin screens are never exposed.

---

## 2. Architecture

Built entirely within `apps/myk9show`. No new Vercel project, no new app, no reverse proxy.

**New pieces:**
- Exhibitor-scoped route group at `/titles/*`
- Element grid UI component in `packages/ui`
- Score entry sheet component in `packages/ui`
- AKC Scent Work seed data migration (sport templates + titles)

**Reused pieces (already built):**
- `titleEngine.ts` — pure computation, no changes needed
- `useTitleProgress` hook — merges platform + manual results
- `useQualifyingManualResultsQuery` — reads from `manual_results`
- `public.manual_results` table — stores qualifying legs
- `public.dogs` + `public.people` — dog roster and exhibitor profiles
- `public.sport_templates` + `public.sport_titles` — title definitions (needs AKC SW data seeded)
- Supabase auth — same account works across all myK9Show features

**Routing access control:** Exhibitors who arrive at `/titles` only see the title tracker nav. The existing secretary/admin navigation is not rendered for the `exhibitor` role. This is already enforced by role-based routing.

---

## 3. Data Model

No new tables. All data lives in existing `public` schema tables.

| Table | Usage |
|---|---|
| `auth.users` | Login — same account as myK9Show |
| `public.people` | Exhibitor profile (`first_name`, `last_name`, `auth_user_id`) |
| `public.dogs` | Dog roster (`name`, `call_name`, `breed`, `akc_number`, `date_of_birth`, `owner_id`) |
| `public.manual_results` | Qualifying scores — one row per qualifying leg |
| `public.sport_templates` | AKC Scent Work sport definition (needs seeding) |
| `public.sport_titles` | Individual title definitions — SWCN, SWN, etc. (needs seeding) |

**New migration required:** Seed AKC Scent Work title data into `sport_templates` and `sport_titles`. The exact leg counts per element/level must be verified against current AKC rulebook before writing the migration.

> ⚠️ **Important:** Once the title tracker is live with real exhibitors, `public.dogs`, `public.people`, and `public.manual_results` hold real user data. All myK9Show schema changes touching these tables must go through a Supabase branch test before pushing to main. See project memory: `project_titles_app_shared_tables.md`.

---

## 4. UI/UX

### 4.1 Dog Picker

Persistent dropdown at the top of the `/titles` screen. Shows all dogs owned by the signed-in exhibitor. Defaults to the last selected dog (persisted in `localStorage`). "Add a dog" option at the bottom opens the dog form.

### 4.2 Element Grid

The primary view. A matrix of **Element × Level** with each cell showing leg progress.

```
              Container    Interior    Exterior    Buried
Novice        [2/3 ●●○]   [3/3 ✓]    [1/3 ●○○]   [0/3 ○○○]   → SWN
Advanced      [0/3 ○○○]   [0/3 ○○○]  [0/3 ○○○]   [0/3 ○○○]   → SWA
Excellent     [locked]    [locked]   [locked]    [locked]    → SWE
Master        [locked]    [locked]   [locked]    [locked]    → SWM
```

**Cell states:**
- **In progress** — `X/Y legs` with filled/empty pip dots
- **Complete** — checkmark + title abbreviation (e.g., SWCN), muted background
- **Locked** — greyed out until the previous level for that element is complete
- **Combined title banner** — appears at the end of each row when all 4 cells are complete (e.g., "SWN earned")

**Interactions:**
- Tap any in-progress or unlocked cell → opens Score Entry sheet pre-filled with that element + level
- Tap a completed cell → shows the qualifying scores that earned it (date, show name, with delete option)
- A persistent "+ Log Score" FAB opens the Score Entry sheet with no pre-fills

**Component location:** `packages/ui/src/components/title-tracker/ElementGrid.tsx`  
myK9Show's existing `TitleProgressSection` (list-based) remains unchanged for now. The grid can replace it in a future session once it's proven in the title tracker.

### 4.3 Score Entry Sheet

Bottom sheet (mobile-friendly). Fields:

| Field | Notes |
|---|---|
| Element | Pre-filled from cell tap; editable |
| Level | Pre-filled from cell tap; editable |
| Date | Defaults to today |
| Show name | Free text, required |
| Placement | Optional — 1st / 2nd / 3rd / 4th+ |
| Notes | Optional free text |

Only qualifying scores are logged here — no pass/fail field. Non-qualifying runs don't affect title progress.

**On save:**
- Optimistic UI — cell updates immediately
- If this was the final leg for an element title: banner — "SWCN earned!"
- If this also completes all 4 elements at that level: full celebration moment — "SWN earned!"

**Edit/delete:** Tap a completed cell → score log list → delete icon per row. No inline edit (delete + re-enter is simpler and avoids stale-data edge cases).

**Component location:** `packages/ui/src/components/title-tracker/ScoreEntrySheet.tsx`

### 4.4 Dog Management

Simple add/edit form for dog details. Fields mirror `public.dogs`: registered name, call name, breed, AKC number, DOB. Accessible from the dog picker "Add a dog" option and from a settings/profile page.

### 4.5 Onboarding

First sign-in: a one-screen prompt to capture `first_name` and `last_name` before landing on the grid. Writes to `public.people` with `auth_user_id` linked. If a `people` record already exists (returning myK9Show user), skip onboarding.

---

## 5. Routes

All under `/titles`, accessible to the `exhibitor` role:

| Route | Screen |
|---|---|
| `/titles` | Element grid for selected dog |
| `/titles/dogs` | Dog roster (add / edit / delete) |
| `/titles/dogs/new` | Add dog form |
| `/titles/dogs/:id` | Edit dog form |
| `/titles/onboarding` | First-time profile setup |

---

## 6. AKC Scent Work Seeding

A single migration seeds the title definitions. Leg counts and prerequisites must be verified against the current AKC Scent Work rulebook before writing. The schema (`sport_templates`, `sport_titles`) is already in place — this is a data-only migration.

Elements: Container, Interior, Exterior, Buried  
Levels: Novice, Advanced, Excellent, Master  
Element titles: SWCN, SWIN, SWEN, SWBN, SWCA, SWIA, SWEA, SWBA, SWCE, SWIE, SWEE, SWBE, SWCM, SWIM, SWEM, SWBM  
Combined level titles: SWN, SWA, SWE, SWM

> **TODO before migration:** Confirm exact leg counts per element/level with user — especially whether Master differs from the lower levels.

---

## 7. Integration Path to Full myK9Show

When myK9Show's exhibitor platform is complete:

1. The exhibitor's dogs are already in `public.dogs`
2. Their qualifying scores are already in `public.manual_results`
3. Their title progress is already computed by `titleEngine.ts`
4. `useTitleProgress` will automatically merge any platform-scored results from myK9Show trials alongside their manual entries
5. The `/titles` section either stays as-is or the element grid gets promoted into the Dog Details "Title Progress" tab — replacing the existing list UI

No migration, no data transfer, no duplicate accounts. The title tracker is already myK9Show — just with a focused entry point.

---

## 8. Out of Scope (v1)

- Other sports (UKC, NACSW, etc.) — architecture supports them via sport templates; add data later
- Automatic result population from myK9Show trials — happens when the exhibitor platform is complete
- Push notifications for title achievements
- Sharing / social features
- PDF title certificate generation
