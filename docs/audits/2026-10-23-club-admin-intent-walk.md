# Club-admin intent walk: 2026-10-23

> Scheduled task `role-intent-walk`. Prompt version: `origin/main` @ `3a6990140a514c2c3c53328526e780a1f99ce84e` (`docs/qa/walks/role-intent-walk.md`).
>
> **ISO week 43 → 43 mod 3 = 1 → club-admin.** First club-admin slot of this rotation. Lens: `docs/roles/club-admin.md` ("Functional only" for fall 2026); `docs/INTENT.md` has no club-admin section.

source: claude · run date 2026-10-23 · author: Claude Code (scheduled, unattended)

## Executive assessment

**The browser walk did not run. Environment coverage gap, not a product verdict.** The walk's own credential rule (Part 1, "Credentials") says that when `E2E_CLUB_ADMIN_PASSWORD` is absent from `apps/myk9show/.env.local` the week cannot run as the right actor and the site admin must not be substituted. The key is absent from that file and from the shell environment, so no sign-in was attempted, no worktree or dev server was started, and no route was walked at any viewport.

Role confidence for club admin is therefore **unmeasured**, the same as before this run. P0 0 · P1 0 · P2 0 · P3 1 — the one P3 is this coverage gap, which the prompt says is report-only. Nothing was filed to Linear and no Linear write was attempted.

## Scope

| Item     | Value                                                                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor    | Intended `clubadmin@myk9t.com` (club-admin-only, Heartland). **Not signed in**: no local secret. Site admin deliberately not substituted (MYK9-137: club gates read `is_site_admin() OR is_club_admin(id)`, so the site admin proves nothing). |
| Viewport | None walked. Mobile, desktop and tablet are all coverage gaps.                                                                                                                                                                                 |
| Build    | None started. Repo state read at `origin/main` `3a6990140`.                                                                                                                                                                                    |
| Data     | Read-only SQL against the shared staging project to establish the fixture state (below). No writes of any kind.                                                                                                                                |

## Environment coverage gap (P3, report-only)

- `E2E_CLUB_ADMIN_PASSWORD` is not a key in `apps/myk9show/.env.local` (the file carries the admin, judge, secretary and exhibitor sets) and is not in the scheduler's shell environment.
- The account itself is fine. `auth.users` holds `clubadmin@myk9t.com`: created 2026-08-24, email confirmed, password set, last sign-in 2026-08-24. Its `people` row ("Morgan Reyes") holds exactly one active grant, `club_admin` on Heartland Scent Work Club, plus an inactive exhibitor grant and no site-wide role. So the fixture that MYK9-137 asked for exists; only the local secret is missing on this machine.
- `apps/myk9show/src/test/e2e/helpers/testUsers.ts` and `scripts/setup-e2e-test-users.ts` both document the account as **local-only**: optional in the setup script, not forwarded by any workflow. The e2e specs under `src/test/e2e/club-admin/` sign in as the site admin, so CI has never exercised this actor either.
- **Unblock (human):** put the password that was set on 2026-08-24 into `apps/myk9show/.env.local` as `E2E_CLUB_ADMIN_PASSWORD`. If that value is lost, re-running `pnpm exec tsx scripts/setup-e2e-test-users.ts` from `apps/myk9show` with a new value rewrites the auth user, which is a shared-system write this run has no mandate for. The next club-admin slot is ISO week 46 (Friday 2026-11-13); without the key it repeats this outcome.

Not filed, per the prompt ("Do NOT file coverage gaps or probe/harness bugs as issues").

## What was done read-only

**Linear reconciliation** (`includeArchived: true`, query "club admin", 60 of 60+ rows read). No open club-admin product defect. In Review: MYK9-1293 ("My Club" in the secretary rail opens a flyout instead of navigating) and MYK9-1243 (PR smoke shares `exhibitor@` with hand testing). Done since August and worth re-verifying in the browser on the first real walk: MYK9-120 (show-access actions silently failed), MYK9-138 (site admins could not reach club-scoped pages), MYK9-359 (read-only `/clubs/:id` for real club admins), MYK9-653 ("Show settings…" did nothing for a club admin), MYK9-660 (empty result submissions and waitlist for a club admin), MYK9-855 (newly approved club read as unauthorized to its requester), MYK9-860 (club admin named under the club name), MYK9-895 (show wizard refused club admins), MYK9-1310 (approval authorizes the club), MYK9-1314 (outsider saw staff-facing authorization copy).

**Recent changes in the window** (merged 2026-09-23 to 2026-10-22, touching club surfaces): MYK9-1310 approval authorizes the club (#3151); MYK9-1267 Browse headers in the detail column (#3143); MYK9-1235 one club number per registry on both new-club forms (#3104); MYK9-1228 Clubs list with detail pane from `lg` (#3074); MYK9-1227 one Browse rail item (#3071); MYK9-1063 Actions menu sections (#2844). All **blocked** for browser verification this run; tests alone are not browser evidence.

**Fixture state on staging** (SQL, read-only; recorded for the next walk, not findings):

| Fact                                                                                                                                                                                                                                 | Implication for the next club-admin walk                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Heartland Scent Work Club (`dededede-…0001`, the fixture's club) has `authorized_at` NULL while hosting 10 live shows with 5 `club_members`. Neither seed file sets `authorized_at`.                                                 | Expect "Pending myK9 authorization" on the club page and a blocked publish gate on new shows. That is fixture state; confirm before filing.     |
| Six clubs exist: authorized American Bloodhound Club (2026-10-16), Darboshea Tervuren Club (2026-09-28), Prairie Trail Dog Sports Club (`dededede-…0002`, 2026-10-02); unauthorized Heartland, Tulsa Agility Club, `WALK TEST club`. | Prairie Trail is the natural non-owned record for the "record the persona does not own" step. `WALK TEST club` is residue from an earlier walk. |

## Regression re-verification

No prior club-admin intent walk exists in `docs/audits/` (the two prior `role-intent-walk` reports are both judge, week 42), so there is nothing from "this role's last two walks" to re-verify. The Done issues listed above are the substitute list for the first real walk.

## Coverage matrix

| Route                                                                 | Mobile  | Desktop | Tablet  | Notes                                   |
| --------------------------------------------------------------------- | ------- | ------- | ------- | --------------------------------------- |
| Sign-in → role home                                                   | skipped | skipped | skipped | no local secret                         |
| `/club-admin/members`                                                 | skipped | skipped | skipped |                                         |
| `/club-admin/payments`                                                | skipped | skipped | skipped | not in `audit-pages`' route inventory   |
| `/clubs` and `/clubs/:id` (own club, Heartland)                       | skipped | skipped | skipped | expect unauthorized-club copy (fixture) |
| Non-owned club `/clubs/dededede-…0002` (Prairie Trail) staff controls | skipped | skipped | skipped | the scoping check MYK9-137 exists for   |
| Show wizard host-club check; Heartland show pages                     | skipped | skipped | skipped |                                         |
| Rail "My Club" flyout (MYK9-1293)                                     | skipped | skipped | skipped | In Review                               |
| Keyboard-only and focus order                                         | skipped | skipped | skipped |                                         |

Skipped routes are coverage gaps, not passes.

## Findings

None confirmed in the browser. No Linear issue created, commented or moved.

## Consolidation observations (from code and docs, not browser)

- `docs/roles/club-admin.md` still describes the role as "a minimal 'assign my secretaries' screen", while the app ships `/club-admin/members` (membership and secretary access requests, show access), `/club-admin/payments` (Stripe onboarding and reconciliation) and club-admin paths through the show wizard. The doc understates the surface the walk has to cover; a human may want to refresh it.
- `docs/INTENT.md` names no target feeling for club admin. The lens for this role is the role doc alone.

## Prompt corrections

**Applied (below `# Part 2`, same commit):** added a "Club-admin week" mechanics section recording the missing local secret, the measured fixture state, the route set and the empty regression list, so the next run checks the key before cutting a worktree.

**Listed only (above `# Part 2`, for a human):**

- "What this walk asks" points club admin at `docs/roles/club-admin.md` and says to read `docs/INTENT.md` first; INTENT.md has no club-admin section. Saying so would save a run the search.
- The `audit-pages` skill's Club Admin inventory lists only `/club-admin/members`; `/club-admin/payments` has existed since the Stripe onboarding work. That file is a skill, not this walk, so it needs its own PR.

## Next proof

1. A human adds `E2E_CLUB_ADMIN_PASSWORD` to `apps/myk9show/.env.local`; week 46 (2026-11-13) then runs the first real club-admin walk.
2. That walk re-verifies the ten Done issues listed above in the browser and walks Prairie Trail as the non-owned record.
3. Decide whether Heartland should be seeded authorized, since the fixture club otherwise shows the pending-authorization state on every walk.
