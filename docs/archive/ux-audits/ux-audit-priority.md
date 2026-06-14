# UX Audit Priority List

**Date:** 2026-04-03
**Source:** Full route inventory of myK9Show (~100 routes), ranked by user impact and INTENT.md role alignment.

---

## Tier 1: Exhibitor Core Journey (highest priority)

These are the pages every exhibitor touches. INTENT says exhibitor should feel "this respects my time."

| #   | Page                    | Path                      | Why Audit First                                                         |
| --- | ----------------------- | ------------------------- | ----------------------------------------------------------------------- |
| 1   | **Show Details**        | `/shows/:id`              | Entry point to registration -- first impression for every exhibitor     |
| 2   | **Registration Wizard** | `/shows/:showId/register` | The money flow. Friction here = lost entries. INTENT says "30 seconds"  |
| 3   | **Exhibitor Dashboard** | `/exhibitor/dashboard`    | Landing page after login -- sets the tone for "everything in one place" |
| 4   | **My Entries**          | `/exhibitor/entries`      | Exhibitors check this constantly before/during show day                 |
| 5   | **Show Day**            | `/exhibitor/show-day`     | Day-of experience -- stress is high, UX must be calm                    |
| 6   | **Dog Detail**          | `/dogs/:id`               | Exhibitors' emotional center -- their dog's career/profile              |

## Tier 2: Secretary Operations (high priority)

Secretary carries the most stress. INTENT says "that was easy."

| #   | Page                     | Path                            | Why                                                       |
| --- | ------------------------ | ------------------------------- | --------------------------------------------------------- |
| 7   | **Pipeline Dashboard**   | `/secretary/dashboard`          | Secretary's home base -- must surface problems, not data  |
| 8   | **Day-of Operations**    | `/secretary/day-of`             | Show-day chaos -- scratches/move-ups must be 1-tap        |
| 9   | **Results Control**      | `/secretary/results-control`    | Recently built (PR #37) -- good time to audit while fresh |
| 10  | **Show Creation Wizard** | `/secretary/create-show/wizard` | Complex multi-step flow -- high cognitive load risk       |
| 11  | **Entry Management**     | `/secretary/entries/:showId`    | Bulk operations under time pressure                       |

## Tier 3: Public Discovery (medium priority)

First contact for new users. Sets expectations.

| #   | Page               | Path                          | Why                                                              |
| --- | ------------------ | ----------------------------- | ---------------------------------------------------------------- |
| 12  | **Browse Shows**   | `/shows`                      | Discovery page -- can users find and understand available shows? |
| 13  | **Landing / Home** | `/`                           | First impression of the entire platform                          |
| 14  | **Sign Up**        | `/sign-up`                    | Conversion funnel -- every friction point loses a user           |
| 15  | **Class Details**  | `/shows/.../classes/:classId` | Results viewing -- exhibitors come here to see scores            |

## Tier 4: Judge & Scoring (medium priority)

INTENT says "invisible technology." Mostly in myK9Q, but myK9Show has judge views.

| #   | Page                      | Path                         | Why                                       |
| --- | ------------------------- | ---------------------------- | ----------------------------------------- |
| 16  | **Judge Class Interface** | `.../classes/:classId/judge` | Scoring UX -- large touch targets, rhythm |
| 17  | **Judge Dashboard**       | `/judge/dashboard`           | Assignment overview                       |
| 18  | **TV Display**            | `/tv/:showId`                | Public-facing -- spectator experience     |

## Tier 5: Settings & Admin (lower priority)

Less frequent, power-user focused.

| #   | Page                | Path                 | Why                                        |
| --- | ------------------- | -------------------- | ------------------------------------------ |
| 19  | **Profile/Account** | `/exhibitor/profile` | Infrequent but must work smoothly          |
| 20  | **Preferences**     | `/preferences`       | Voice announcements, notification settings |
| 21  | **Subscription**    | `/subscription`      | Monetization touchpoint                    |
| 22  | **Admin Dashboard** | `/admin/dashboard`   | Admin-only, low user count                 |

---

## Recommendation

Start with Tier 1 (exhibitor core journey, items 1-6). These pages serve every user, are the most visible, and directly map to the INTENT.md exhibitor feeling: "this respects my time." Multiple audits can run in parallel since the pages are independent.
