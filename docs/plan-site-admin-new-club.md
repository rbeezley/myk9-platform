# Site admin: one way to approve a new club (MYK9-2512, MYK9-2513)

> **Status:** Active

## Parent: MYK9-2512

A club asks to join through the home page form (`request_new_club`, MYK9-2046). The owner then sees it in two places and can approve it in two ways that do different things. MYK9-2512 collapses that to one list and one Approve: Onboarding's "New club access requests" is the list, and the club page's Authorize runs the same approval. Its UI work (Onboarding Decline option, club page copy and confirmation, dropping the unused `onboarding_requests` reads) builds on the server work below, so the server issue goes first. This section is the parent's scope as handed to the MYK9-2513 implementer; the issue text in Linear is the source of truth.

## This issue: MYK9-2513

The server half. Two functions authorize a club and disagree (live database, read 2026-11-27):

|                                                 | `review_club_access_request` (Onboarding Approve) | `set_club_authorization` (club page Authorize) |
| ----------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Authorizes the club                             | Yes                                               | Yes                                            |
| Marks the request approved                      | Yes                                               | No                                             |
| In-app notice and "Your club is ready" email    | Yes                                               | No                                             |
| Asks for the password (`require_recent_reauth`) | Yes                                               | No                                             |

After the club page door, the request stays under "New club access requests", stays in the dashboard count, and the requester is never told.

## Decisions (owner, 2026-11-27)

- **One list, one Approve.** The club page's Authorize runs the same approval as Onboarding. The rejected alternative, refusing with "approve it in Onboarding", leaves two doors where one refuses, keeps the banner copy untrue, and does not fit the WALK TEST club (approved before approval authorized clubs, still unauthorized).
- **Password on both.** Authorizing a waiting club asks for a recent password through either door. A revoke never does.
- **Offer delete in Decline.** A decline may also delete the club in the same step. This revises MYK9-2046's "decline removes nothing": a decline still removes nothing unless the owner asks.

## Design

- `private.authorize_club_core(club, authorized)` holds the old `set_club_authorization` body (lock, idempotence, the authorization-write GUC, audit row). No client role can call it.
- Public `set_club_authorization(club, true)`: site-admin check; asks for the password when the club is unauthorized or has a pending request; if a pending `club_access_requests` row has `created_club_id` = the club, calls `review_club_access_request(id, 'approved')`; otherwise calls the core. A revoke calls the core with no password.
- `review_club_access_request` and the `authorize_club_created_by_site_admin()` trigger call the core, never the public function. That is what prevents re-entry: review used to call `set_club_authorization` before closing the request, so a public door that delegates to review would loop. A site admin creating a club is not approving a request: no password, no request touched.
- `review_club_access_request` gains a trailing `p_delete_club boolean DEFAULT false`. With a decline it marks the request denied and calls `soft_delete_club` in the same transaction (`MK011` while the club has live shows rolls the decline back; role grants deactivate through the MYK9-1388 trigger and do not come back on a restore). The flag is refused on an approval and on a request that created no club. The old five-argument overload is dropped explicitly.
- Client: `reviewClubAccessRequest` takes `deleteClub?: boolean` and sends `p_delete_club` only when true. No Onboarding or club page UI in this issue.
- Migration `20261128043900_myk9_2513_one_club_approval.sql`. Applied by `supabase db push` after merge, with a dry run and a `pg_proc.proacl` check. Regenerate `database.types.ts` after the push.

## Non-goals

Automatic approval; changing `request_new_club`; restoring roles when a deleted club is restored; editing applied migrations; dropping `onboarding_requests` (a separate migration once MYK9-2512's UI no longer reads it).

## Testing phase

- Behavioral SQL, extending `supabase/tests/club_access_request_approval_test.sql` (cases 2513.1 to 2513.6) and `supabase/tests/club_authorization_gate_test.sql` (2513-gate). They set `request.jwt.claims` with a password `amr`, because `require_recent_reauth` passes silently with no JWT. The first case was run red against the old functions before the migration.
- Cases: club page door closes the pending request, one notice, one email job, roles granted, one audit row, repeat press adds nothing; stale or missing `amr` is refused (`MKAUT`) on both doors with nothing changed; a waiting club with no pending request authorizes, revokes (no password) and re-authorizes sending nothing; a site admin's own new club needs no password; decline removes nothing, decline with delete denies and deletes, `MK011` leaves the request pending; grants (`anon` none, `authenticated` yes, core closed, one review overload).
- Unit: `src/services/database/__tests__/reviewClubAccessRequest.test.ts`.
- `pnpm qa:sql-local` (Docker-free local stack), then CI's `sql-tests` as the gate. After the push: `pg_proc.proacl` for the three public functions and the core, and a read of the WALK TEST club.
