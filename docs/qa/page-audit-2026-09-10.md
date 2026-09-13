# Manual Page Audit — 2026-09-10

> **Status:** Active
> **Method:** Richard walks every route by role group in a real browser against `pnpm dev:show` on
> this worktree; findings reported as screenshot + one line; Claude triages each batch into
> _fix inline_ (branch per role group) or _file to Linear_ (label `Page Audit 2026-09-10`).
> Route list generated from `src/App.tsx` + `src/routes/*.tsx` on `56128426f`, not from the
> `audit-pages` skill list (which had drifted).

## How to mark a row

| Mark      | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `clean`   | Rendered, data loaded, no console errors beyond known noise, OK at 375px |
| `no data` | Route needs an ID / state we do not have seeded — note what is missing   |
| `F-nn`    | Finding ID from the Findings section below                               |
| `n/a`     | Redirect-only or parked route; confirm the redirect target loads         |

Known noise to ignore: `Maximum update depth exceeded` (tracked in Linear "App-Wide Render Loop").

## Seed IDs (dev database, verified 2026-09-10)

| Placeholder    | Value                                  | Notes                                                |
| -------------- | -------------------------------------- | ---------------------------------------------------- |
| `:showId`      | `dededede-0000-0000-0000-000000000010` | Heartland Scent Work Classic, published, 516 entries |
| `:trialId`     | `dededede-0000-0000-0000-000000000021` | first trial of the show above                        |
| `:classId`     | `dec1a55e-0000-0000-0000-000000000032` | first class of that trial                            |
| `:entryId`     | `dededede-0000-0000-0000-000000000051` | an entry owned by exhibitor@myk9t.com                |
| `:id` (club)   | `dededede-0000-0000-0000-000000000001` |                                                      |
| `:id` (dog)    | `dededede-0000-0000-0000-000000000041` | owned by exhibitor@myk9t.com                         |
| `:id` (person) | `6fd402f4-88fb-447d-876e-7c6ae3c429d1` | exhibitor@myk9t.com                                  |
| draft show     | `6cea4cdf-0f2c-4db9-98bc-aa97a654ef31` | "ZZ Audit - Club Persistence Probe", 0 entries       |

Accounts: `exhibitor@` / `secretary@` / `judge@` / `clubadmin@` / `testadmin@` at `myk9t.com`; password in `.env.local`.

## 1. Public (signed out)

| #   | Route                                                              | Mark       | Note                                                   |
| --- | ------------------------------------------------------------------ | ---------- | ------------------------------------------------------ |
| 1   | `/`                                                                | clean      |                                                        |
| 2   | `/sign-in`                                                         | clean      |                                                        |
| 3   | `/sign-up`                                                         | clean      |                                                        |
| 4   | `/forgot-password`                                                 | clean      |                                                        |
| 5   | `/reset-password`                                                  | clean      | needs a token; check the no-token state renders sanely |
| 6   | `/registration`                                                    | clean      |                                                        |
| 7   | `/shows`                                                           | F-01, F-02 |                                                        |
| 8   | `/shows?view=map`                                                  | clean      |                                                        |
| 9   | `/shows/:id`                                                       | F-04       |                                                        |
| 10  | `/shows/:showId/trials/:trialId`                                   | F-05       |                                                        |
| 11  | `/shows/:showId/trials/:trialId/classes/:classId`                  | F-05       |                                                        |
| 12  | `/shows/:showId/trials/:trialId/classes/:classId/results`          | F-05       |                                                        |
| 13  | `/clubs`                                                           | F-05       |                                                        |
| 14  | `/clubs/:id`                                                       | F-05       |                                                        |
| 15  | `/pricing-page`                                                    | clean      |                                                        |
| 16  | `/fees`                                                            | clean      |                                                        |
| 17  | `/support`                                                         | clean      |                                                        |
| 18  | `/help/credentials`                                                | clean      |                                                        |
| 19  | `/terms`                                                           | clean      |                                                        |
| 20  | `/privacy`                                                         | clean      |                                                        |
| 21  | `/sms`                                                             | clean      |                                                        |
| 22  | `/tv/:showId`                                                      | F-09       | TV board                                               |
| 23  | `/at-show` (signed out, passcode entry)                            | clean      |                                                        |
| 24  | `/some-nonexistent-route` (404 page)                               | F-10       |                                                        |
| 25  | `/calendar`, `/dogs`, `/people` (signed out → redirect to sign-in) | clean      | confirm redirect, not a blank page                     |

Redirect-only (confirm target loads): `/login`→`/sign-in`, `/browse-shows`→`/shows`, `/shows/browse`→`/shows`.

## 2. Exhibitor (exhibitor@myk9t.com)

| #   | Route                                        | Mark                   | Note                                                                                 |
| --- | -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| 1   | `/onboarding`                                | F-11                   | may redirect if already onboarded                                                    |
| 2   | `/exhibitor/entries`                         | defer                  | redesign in flight on `claude/exhibitor-entries-redesign-6b9089`; not walked         |
| 3   | `/my-entries`                                | F-12                   |                                                                                      |
| 4   | `/exhibitor/show-day`                        | F-12                   | redirect itself is correct; the Page Directory calls it a working critical path      |
| 5   | `/exhibitor/check-in/:entryId`               | F-12                   | redirect correct, `:entryId` discarded; no reachable caller                          |
| 6   | `/exhibitor/payments`                        | clean                  |                                                                                      |
| 7   | `/exhibitor/analytics`                       | F-12                   | placeholder is correct (`analytics: false`); Page Directory calls it working         |
| 8   | `/account`                                   | clean                  | all tabs walked                                                                      |
| 9   | `/dogs`                                      | clean                  | 259 dogs; scoping verified — 259 of 261 really are owned by this person              |
| 10  | `/dogs/:id`                                  | F-14                   | loads fine; design review requested, not a defect                                    |
| 11  | `/calendar`                                  | F-12, F-15             | placeholder correct (`calendar: false`); see F-15 for the three-calendar duplication |
| 12  | `/notifications`                             | F-16                   | renders, but duplicates the Message Center panel on a DIFFERENT data source          |
| 13  | `/messages/:showId`                          | clean                  | thread view the Message Center routes to; shares `useMessageStore` with the panel    |
| 14  | `/shows/:showId/register`                    | F-17, F-18, F-21, F-24 | walked steps 1-3 to the cart; not paid                                               |
| 15  | `/cart`                                      | F-19                   | loads; fee paragraph restates `/fees` against MYK9-229's own decision                |
| 16  | `/checkout/success`                          | clean                  | direct hit with no session states it honestly; but see F-20                          |
| 17  | `/checkout/cancel`                           | clean                  |                                                                                      |
| 18  | `/subscription`                              | clean                  |                                                                                      |
| 19  | `/classes/:classId`                          |                        |                                                                                      |
| 20  | `/trials/:trialId`                           |                        |                                                                                      |
| 21  | `/people/:id` (own person)                   |                        |                                                                                      |
| 22  | `/at-show/:showId`                           |                        | as exhibitor                                                                         |
| 23  | `/secretary/dashboard` (wrong role → denied) |                        | denied is correct; blank is a bug                                                    |

Redirect-only: `/exhibitor/dashboard`→`/exhibitor/entries`; `/exhibitor/profile`, `/exhibitor/account`, `/profile`, `/settings`, `/preferences`→`/account`.

## 3. Secretary (secretary@myk9t.com)

| #   | Route                                                       | Mark | Note                          |
| --- | ----------------------------------------------------------- | ---- | ----------------------------- |
| 1   | `/secretary`                                                |      |                               |
| 2   | `/secretary/dashboard`                                      |      |                               |
| 3   | `/secretary/tasks`                                          |      |                               |
| 4   | `/secretary/create-show`                                    |      |                               |
| 5   | `/secretary/create-show/wizard`                             |      | walk all steps, save as draft |
| 6   | `/secretary/shows/:showId`                                  |      | workbench landing             |
| 7   | `/secretary/shows/:showId/setup`                            |      |                               |
| 8   | `/secretary/shows/:showId/show-desk`                        |      |                               |
| 9   | `/secretary/shows/:showId/entry-management`                 |      |                               |
| 10  | `/secretary/shows/:showId/reports`                          |      |                               |
| 11  | `/secretary/shows/:showId/results-control`                  |      |                               |
| 12  | `/secretary/shows/:showId/submit-results`                   |      |                               |
| 13  | `/secretary/shows/:showId/classes/:trialId`                 |      |                               |
| 14  | `/secretary/shows/:showId/classes/:trialId/create`          |      |                               |
| 15  | `/secretary/shows/:showId/edit`                             |      |                               |
| 16  | `/secretary/shows/<draft show id>`                          |      | draft state of the workbench  |
| 17  | `/secretary/pipeline/:trialId`                              |      |                               |
| 18  | `/secretary/entries`                                        |      | no showId                     |
| 19  | `/secretary/entries/:showId`                                |      |                               |
| 20  | `/secretary/register/:showId`                               |      |                               |
| 21  | `/secretary/waitlist`                                       |      |                               |
| 22  | `/secretary/day-of`                                         |      |                               |
| 23  | `/secretary/check-in`                                       |      |                               |
| 24  | `/secretary/run-order`                                      |      |                               |
| 25  | `/secretary/results-control`                                |      |                               |
| 26  | `/secretary/results-submission`                             |      |                               |
| 27  | `/secretary/reports`                                        |      |                               |
| 28  | `/secretary/settings`                                       |      |                               |
| 29  | `/secretary/volunteers`                                     |      |                               |
| 30  | `/secretary/volunteer-scheduling`                           |      |                               |
| 31  | `/secretary/messages`                                       |      |                               |
| 32  | `/secretary/messages/:showId`                               |      |                               |
| 33  | `/trials/:trialId/classes`                                  |      |                               |
| 34  | `/trials/:trialId/classes/create`                           |      |                               |
| 35  | `/shows/:showId/trials/:trialId/classes/:classId/secretary` |      |                               |
| 36  | `/scoring/classes/:classId/entries`                         |      |                               |
| 37  | `/scoring/classes/:classId/entries/:entryId`                |      |                               |
| 38  | `/people`                                                   |      |                               |
| 39  | `/people/:id`                                               |      |                               |
| 40  | `/users/:id`                                                |      |                               |
| 41  | `/at-show/:showId` (as secretary)                           |      |                               |

Redirect-only: `/users`→`/people`, `/shows/new`→`/secretary/create-show/wizard`.

## 4. Judge (judge@myk9t.com)

| #   | Route                                            | Mark | Note                                              |
| --- | ------------------------------------------------ | ---- | ------------------------------------------------- |
| 1   | `/judge/dashboard`                               |      |                                                   |
| 2   | `/judge/check-in`                                |      |                                                   |
| 3   | `/judge/stats`                                   |      |                                                   |
| 4   | `/results/dashboard`                             |      |                                                   |
| 5   | `/at-show`                                       |      |                                                   |
| 6   | `/at-show/:showId`                               |      |                                                   |
| 7   | `/at-show/:showId/class/:classId`                |      |                                                   |
| 8   | `/at-show/:showId/class/:classId/score/:entryId` |      | open only; do not submit a score on the real show |
| 9   | `/at-show/:showId/class/:classIdA/:classIdB`     |      | paired classes; needs a second class id           |

## 5. Club Admin (clubadmin@myk9t.com)

| #   | Route                   | Mark | Note                      |
| --- | ----------------------- | ---- | ------------------------- |
| 1   | `/club-admin/members`   |      |                           |
| 2   | `/club-admin/payments`  |      |                           |
| 3   | `/clubs/:id` (own club) |      | admin affordances visible |

## 6. Site Admin (testadmin@myk9t.com)

| #   | Route                                    | Mark | Note                                 |
| --- | ---------------------------------------- | ---- | ------------------------------------ |
| 1   | `/admin/dashboard`                       |      |                                      |
| 2   | `/admin/users`                           |      |                                      |
| 3   | `/admin/permissions`                     |      |                                      |
| 4   | `/admin/permissions/users`               |      |                                      |
| 5   | `/admin/permissions/audit`               |      |                                      |
| 6   | `/admin/permissions/roles`               |      |                                      |
| 7   | `/admin/permissions/roles/new`           |      |                                      |
| 8   | `/admin/permissions/roles/:roleId`       |      | pick one from the list               |
| 9   | `/admin/permissions/roles/:roleId/clone` |      |                                      |
| 10  | `/admin/role-requests`                   |      |                                      |
| 11  | `/admin/templates`                       |      |                                      |
| 12  | `/admin/onboarding`                      |      |                                      |
| 13  | `/admin/judges/analytics`                |      |                                      |
| 14  | `/admin/payouts`                         |      |                                      |
| 15  | `/admin/health`                          |      | do not click Run now unless intended |
| 16  | `/admin/support`                         |      |                                      |
| 17  | `/admin/help`                            |      |                                      |
| 18  | `/admin/deleted-items`                   |      |                                      |
| 19  | `/admin/data-lifecycle`                  |      |                                      |
| 20  | `/admin/load-testing`                    |      | parked; observe only                 |
| 21  | `/admin/rbac-test`                       |      | parked; observe only                 |

Redirect-only: `/admin`→`/admin/dashboard`. Parked: `/prototype/show` (skip unless it crashes the router).

## Findings

Format: `F-nn | role | route | P# | symptom | disposition | proof`

| ID   | Role      | Route                                                                | P#  | Symptom                                                                                                                                                                                                                                                                 | Disposition     | Closure proof                                                                 |
| ---- | --------- | -------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| F-01 | public    | `/shows`                                                             | P3  | Search placeholder clipped: needs 329px, has 128px, at every viewport (input is fixed-width)                                                                                                                                                                            | inline          | Rendered-width assertion, placeholder fits at 1440 and 375px                  |
| F-02 | all       | `/shows?discipline=*`                                                | P1  | Every discipline filter returns 0 shows. Mapper reads `trial_type`; replicated trials carry `trialType`                                                                                                                                                                 | inline          | Assertion-first unit test on the mapper, then browser replay                  |
| F-04 | all       | any anchor link (seen on `/shows/:id`)                               | P2  | Anchor scroll lands the target under the 48px fixed header; `scroll-padding-top` is `auto`                                                                                                                                                                              | inline          | Geometry assertion: target top >= header bottom after hash nav                |
| F-05 | public    | trials, classes, results, clubs                                      | P1  | Anonymous visitors read entry lists (handler names, dog names, armbands) and club pages                                                                                                                                                                                 | linear          | Product decision + anon replay per route                                      |
| F-09 | public    | `/tv/:showId`                                                        | P2  | Podium rendered, then emptied to "No classes currently in progress" with no navigation                                                                                                                                                                                  | linear MYK9-467 | Reproduce the transition; show-day surface                                    |
| F-10 | public    | 404 page                                                             | P3  | "404" heading clipped 32.5px behind the fixed header; wrapper has `padding-top: 0`                                                                                                                                                                                      | inline          | Geometry assertion on the 404 wrapper                                         |
| F-11 | exhibitor | `/onboarding`                                                        | P3  | "Welcome to myK9Show" clipped behind the fixed header; all 3 page shells set their own top padding                                                                                                                                                                      | inline          | Class resolves to 88px / 64px vs 0px control; shell-parity test               |
| F-12 | exhibitor | `/my-entries`, `/exhibitor/show-day`, `/exhibitor/check-in/:entryId` | P2  | Unfinished route retirement: Page Directory advertises two retired redirects as working critical-path show-day features; `/my-entries` is a duplicate route; 359-line dead `MultiDogSchedule`                                                                           | linear MYK9-476 | No working+critical-path entry renders only a redirect, pinned by a test      |
| F-13 | n/a       | `routeRegistry.ts`                                                   | P4  | Preloading subsystem has no caller; tests describe preloading that never happens. Zero bundle cost                                                                                                                                                                      | linear MYK9-477 | Exports have a caller, or preloader wired and config corrected                |
| F-14 | exhibitor | `/dogs/:id`                                                          | P3  | Design review requested. Page already consolidated 7 tabs to 3 sections under an OPEN OpenSpec change                                                                                                                                                                   | linear MYK9-478 | UX-Audit findings table; complaint captured in Richard's terms                |
| F-15 | exhibitor | `/calendar` vs `/shows?view=calendar`                                | P3  | Three calendar surfaces: `/calendar` is a DISABLED second wrapper around the same `ShowCalendar` that Browse Shows ships working; ICS subscribe is a third                                                                                                              | linear MYK9-480 | One surface renders ShowCalendar, or each has a stated distinct purpose       |
| F-16 | exhibitor | `/notifications`                                                     | P2  | Page reads the `notifications` TABLE; Message Center panel reads four zustand stores. Nothing links to the page; it is in neither routeRegistry nor pageDirectory                                                                                                       | linear MYK9-481 | Authoritative source identified; verified with real rows they cannot disagree |
| F-17 | exhibitor | `/shows/:showId/register`                                            | P3  | Wizard redesign. Confirmed: step labels split mid-word (`Class es`); checkboxes 44px (F-18). Structural: ~11.1k lines, TWO dog-selection steps, ~1.1k lines nothing renders                                                                                             | linear MYK9-483 | Steps 2-4 walked first; UX-Audit table; duplicate steps resolved              |
| F-18 | exhibitor | `/shows/:showId/register` step 1                                     | P3  | Dog picker checkbox forces `min-h-11 min-w-11` on the control's visible box, not a wrapper: a 44px square holding a 16px tick. Also `MAPLE "MAPLE"` when names match                                                                                                    | linear MYK9-485 | Default checkbox size; 44px hit area measured, not asserted from classes      |
| F-19 | exhibitor | `/cart`                                                              | P4  | Order Summary restates the `/fees` explanation inline; MYK9-229 decided "link, never restate". Its AC #1 requires the split stay LABELLED APPROXIMATE                                                                                                                   | linear MYK9-491 | Paragraph gone, link kept, split still reads as approximate                   |
| F-20 | exhibitor | `/checkout/success`                                                  | P3  | Success exit navigates to `/my-entries` (the orphan) while the error card exits to `/exhibitor/entries`; labels disagree too ("View My Shows" vs "View My Entries")                                                                                                     | linear MYK9-476 | Both exits use the canonical path and one label                               |
| F-21 | exhibitor | `/shows/:showId/register` step 2                                     | P4  | Two classes sharing element+level render identical chips. Triggering data is a FIXTURE, not a real trial shape — downgraded from P2. Fix stands as an operator-error guard: `classes` has no uniqueness constraint                                                      | linear MYK9-489 | FIXED 124a3d8ae                                                               |
| F-22 | public    | show premium offered-classes                                         | P3  | MY BUG, shipped d4cb4941c: level-keyed grouping merged two classes sharing element+level. Confirmed live signed out. First fix (4259a1eb9) was itself harmful — see F-25                                                                                                | linear MYK9-487 | FIXED 124a3d8ae; signed-out browser check still outstanding                   |
| F-23 | data      | Heartland show                                                       | P3  | One show carries AKC, UKC and ASCA trials. Domain rule question plus seed realism — it makes every exhibitor screenshot unrepresentative                                                                                                                                | linear MYK9-490 | Domain rule decided; seed reflects it                                         |
| F-24 | exhibitor | `/shows/:showId/register` step cards                                 | P3  | Connector line shows through the translucent card and strikes through the "Done" label, so a completed step reads as struck out. Same root as F-17: the status pill owns the right half of the card                                                                     | linear MYK9-483 | No connector crosses a status label at any step                               |
| F-25 | process   | class label rule                                                     | P2  | MY BUG: 4259a1eb9 + b9c267a67 applied a name-derived suffix unconditionally. Over every real class row that rewrote 14 of 24 labels, 13 harmfully (`Advanced Load 2 Class 1`). Passed red-green, 19,661 shuffled tests, typecheck, lint, ratchet — no gate could see it | FIXED 124a3d8ae | Collision gate; measured 1 label changes, the intended one                    |
| F-26 | data      | Heartland Saturday trial                                             | P3  | `Interior Advanced Preliminary` is a test fixture with an invented level, sitting in the show every audit walks. Caused F-21 and F-22 to be mis-analysed as real domain cases                                                                                           | linear MYK9-490 | Fixture named as such, or moved out of the demo show                          |

Withdrawn: **F-03** — the walk used the literal URL `/shows/:id`. "Show Not Found" is correct for a
show whose id is the string `:id`. The real ID loads fine. Not a defect.

Merged into F-05: the separately reported public access on `/shows/:showId/trials/:trialId`,
`.../classes/:classId`, `.../classes/:classId/results`, `?tab=entries`, `/clubs`, `/clubs/:id`.

### F-02 root cause (confirmed)

`mapDatabaseToShow` derives `show.events` from `rawTrials.map(t => t.trial_type)`, but `rawTrials`
comes from `replicatedTrialsTable`, whose rows carry `trialType`. Measured in the live IndexedDB
store: 16 replicated trials, **0** with `trial_type`, **16** with `trialType`. So `events` always
falls back to `[organization]` (e.g. `AKC`), and `disciplineMatchesEvent` never matches. The filter
has never worked for any user. Distinct trial-type values present: `Scent Work`, `scent_work`,
`nosework`, `scent_detection` — the normalizer handles the first two; the last two are a separate
vocabulary question, not this bug.

### F-05 conflicts to resolve before implementing

The stated rule is: everything except the show premium, `/shows`, `/sign-in` and `/sign-up` requires
authentication. Three existing deliberate behaviors conflict, and each needs an explicit call:

1. **`/tv/:showId` must stay anonymous.** It is the venue display board, run on a TV at the show.
   Auth-gating it breaks show day.
2. **Public results are a shipped feature.** `supabase/migrations/20260616120000_public_results_release_gate.sql`
   exists specifically so a secretary can release results to an anonymous, shareable link.
   Auth-gating `.../classes/:classId/results` reverts that migration's purpose.
3. **The entries tab is public by written intent.** `TrialDetailsPage.tsx` declares
   `PUBLIC_TAB_IDS = ['overview', 'entries']` with a load-bearing comment. Anon column grants on
   `entries` (armband, handler, dog_id, run_order, …) were granted on purpose to match. This is the
   one worth changing: it is the actual PII exposure.

Recommended split: gate the **entries** tab behind auth, keep overview/classes public so a
prospective exhibitor can see what is offered, keep results public behind the existing release gate,
keep the TV board public. That satisfies the intent behind the report without reverting shipped work.

## Per-group summary

```
Public — 25 routes walked (signed out)
  Console errors: 0 beyond known noise   Network 4xx/5xx: 0
  Findings: 6 (F-01, F-02, F-04, F-05, F-09, F-10) + 1 withdrawn (F-03)
  Clean: /, /sign-in, /sign-up, /forgot-password, /reset-password, /registration,
         /shows?view=map, /help/credentials, /fees, /pricing-page, /support,
         /terms, /privacy, /sms, /at-show, and all three redirects
  Fixed inline: F-01, F-02, F-04, F-10 (commit 5d25a56f3)
  Filed: F-05 -> MYK9-466, F-09 -> MYK9-467
```
