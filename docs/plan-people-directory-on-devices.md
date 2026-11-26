# People directory on devices: page it, keep sign-out as built, scope later

> **Status:** Active

Linear: MYK9-2253. Parent plan: [plan-offline-scale.md](plan-offline-scale.md). Written 2026-11-25. Docs only. No code has been written for this plan.

## Where this stands

Most of MYK9-2253 has shipped. The issue text describes the code as it was on 2026-11-19.

| What the issue found                                              | Today                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The directory survives sign-out                                   | Fixed. Sign-out strips phone, email and address, and keeps names (MYK9-2255, #4270).                                 |
| The handler shows as the owner, offline                           | Fixed. The saved directory, then the names-only cache, then "Owner name not on this device" (MYK9-2256, 2265).       |
| A cold device misses duplicates silently                          | Fixed. Add Person says when it could not check (MYK9-2257).                                                          |
| No phone offline                                                  | Fixed. Person details read the saved directory (MYK9-2265).                                                          |
| Owners with no dogs not found in Add entry                        | Fixed. `NoDogsMatchPeople` lists matching people (MYK9-2262).                                                        |
| A walk-in is readable by the next account                         | Fixed (MYK9-2277).                                                                                                   |
| **It truncates at 1,000**                                         | **Open.** The owner cancelled the fix (MYK9-2273) on 2026-11-19. The alert at 800 people is the warning (MYK9-2274). |
| **Every person, with street address, on every management device** | **Open by decision.** Revisited when the alert fires.                                                                |

Production on 2026-11-25: 84 live people (89 with deleted ones).

## The existing design and why

- **One preload.** `App.tsx` calls `useUserStore.loadUsers()` once a session has a management role (`shouldLoadPeopleDirectory`: site admin, secretary, club admin, chairman). `getAllUsers` reads every live `people` row with `PEOPLE_MAPPER_COLUMNS` (including `street_address`, `city`, `state`, `zip_code`, `country`) and judge qualifications, in one request sorted by name.
- **Saved on the device.** The store persists `users` as `myk9show-user-storage` (IndexedDB). That is why the desk works offline. A non-management session purges it once roles resolve (SA-008, `keepPeopleDirectoryPurged`).
- **Sign-out keeps names on purpose.** MYK9-202: sign-in needs the auth server, so a secretary who signs out by habit cannot get back in at a venue with no signal. Every replica (dogs, entries, shows) stays on the device so that a later sign-in finds the show. MYK9-1139 records the cost: the next account can read from a warm replica. The CLAUDE.md lesson applies here: identity and people must be as offline-durable as the data they label, or a cold offline boot shows "no rows" as fact. MYK9-2255 kept names for that reason and removed only contact details.

## Who reads the directory

About 30 non-test files read `useUserStore`. They split into two groups.

**Needed offline at the desk (show day):**

- Owner names on Entry Forms, Refund all and the check-in desk: `hooks/entryDisplayNames.ts`, `hooks/useEntryManagementData.ts`, `store/showStore.ts`, `hooks/realtimeShowRow.ts`.
- The walk-in duplicate check: `CreatePersonForm.tsx`, and `NoDogsMatchPeople.tsx` in Add entry.
- Person lookup and phone: `useResolvePerson`, `useResolvePersonName`, `UserDetailsView`, `DogDetailsMain`, `useViewerOwnsDog`.
- Owner and handler pickers in the entry workflow: `useRoleBasedData`, `WorkflowStepContent`.

**Online only (set-up and admin):** show wizard and officials (`ShowDetailsStep`, `useCloneFromShow`, `useQualifiedWizardJudges`, `ShowOfficialsEditor`, `ShowEditForm`, `ClassEditForm`), club members (`AddMemberDialog`, `useClubMembersManager`), `BrowsePeoplePage`, `UserEditPanel`, the command palette, `PredictiveLoader` and `LoadTestService`.

No reader needs a street address offline. Person details and the edit panel show it, and both are reached online in practice.

## Options

**A. Do nothing; close MYK9-2253 now.** The owner already chose this for scoping. At 84 people the cut-off is far away, and the alert fires at 800. Cost: when it bites, it is silent. People late in the alphabet drop out of the duplicate check and the owner names, and nothing on screen says so. That breaks decision 4 of the parent plan ("a short download is a failure"). The fix is also small and the pattern exists. Honest weight: acceptable for December, weak for a season.

**B. Delete the directory; look people up on demand.** This was MYK9-2260 and 2267. It removes the cut-off and the exposure. But offline the desk then holds no people at all, unless each saved show carries its own people (MYK9-2259, 2263), which is a migration and a sync change. Rejected for now: the owner parked it, and the review of PR #4230 showed that how rows leave a device is the hard part.

**C. Link to what exists.** The names-only owner cache (`ownerNameCache`) and the walk-in rows already cover parts of the desk. They do not cover the duplicate check against people who have never entered this show, which is the mySWT bar. Not enough alone.

**D. Fix the directory in place.** Page it, treat a short load as a failure, and optionally stop saving addresses. This is MYK9-2273, cancelled. Recommended in part, below.

## Proposed shape: three independent PRs

**PR 1: page the directory (a bug fix, first).** Reuse `fetchKeysetPages` from `services/replication/keysetPager.ts` (the MYK9-2252 pattern: keyset on `updated_at` and `id`, stop only on an empty page). Then sort by last and first name on the client, as the store does today. Also read the server's count and, if the load is short, keep the copy already on the device and report it through the existing short-download alert (MYK9-2254). No migration, no new screen. Trap: `people.updated_at` is nullable. No live row is null today, but the pager cannot reach a null row: a page that ends on one throws, and the cursor comparisons never match null, so it is left out of later pages. Skipping the filter on the first page does not fix this. Page this full read on `id` alone (add an `id`-only cursor option to `fetchKeysetPages`, or a small loop beside it). A test pins a null-timestamp person beyond the first page.

A short load must also reach Add Person. The store keeps a flag, `directoryIncomplete`, set when a refresh is confirmed short or fails, and cleared by a full load. `CreatePersonForm.handleSave` treats it like an empty directory: it asks the server before saving, and shows the existing "checked saved people only" line if the server cannot answer. Without this, a nonempty older copy misses a walk-in's existing record with no warning, because the server lookup runs only when `people.length === 0`.

**PR 2: no street address in the saved copy (optional).** Persist name, phone and email only. Strip address fields from an old saved copy on first run, with no network. Person details and the edit panel read the one person's address from the server when they open. That read only adds the address: name and phone still come from the saved directory and render when the read pauses or fails, as they do offline today (`useRoleBasedPeople`). An edit must not send address fields that never loaded, so a save never blanks an address. Watch the partition lesson: grep every reader of the address fields first.

**PR 3: scope to the club (parked).** Unchanged from the parent plan. It waits for the MYK9-2274 alert (10 live clubs or 800 people). The settled points stay: the club is the unit, the desk gets name, phone and email, a judge gets names only.

**Sign-out: no change.** The decision is built (MYK9-2255). Confirmed sign-out still ends the session and clears the saved roles (`AccountMenuContent`, MYK9-202); the previous user's access never survives. Only the permitted device data stays: names and the replicas. It must not grow into a full clear: clearing names or the replicas re-creates the MYK9-202 lockout for the next sign-in, and an unsent walk-in must never be removed.

## Recommendation

Do PR 1 now. It is one file plus a test, it stops a silent failure the parent plan already calls a bug, and it is the only remaining "Done when" line that code can meet without reopening scoping. It reverses part of the owner's 2026-11-19 cancellation, so it goes to Linear as `needs:decision` on MYK9-2273 before anyone builds it. Leave PR 2 and PR 3 parked. Close MYK9-2253 when PR 1 ships, or now if the owner says no.

## Testing

- PR 1: a mocked server that returns at most 500 rows per request serves 1,200 people. The load gets all of them, and a person late in the alphabet is found by the duplicate check. Several rows share one `updated_at`. A row with null `updated_at` is still loaded.
- PR 1: a short load keeps the earlier saved copy and sends one alert. A failed load keeps it too.
- PR 1: with a nonempty saved copy and a short refresh, Add Person for a person missing from that copy asks the server and holds on the match; with the server down it shows the saved-only line.
- PR 1: the sign-out tests still pass: `useAuth.signOutPeople.test.ts` and `userStore.coldBoot.test.ts`. A load running at sign-out writes nothing back.
- PR 2, if built: the stored value holds no address field; an old saved copy loses addresses offline on first run; saving from the edit panel keeps the address. Offline, person details still show name and phone, and a save sends no address fields.
- The app suite shuffled six times (`pnpm vitest run --sequence.shuffle`), since the store writes browser storage.
- `verify:offline` on the local stack: load as a secretary, go offline, reload, find a person on Entry Forms and in Add Person.

## Review notes

- Codex review, 2026-11-25: all four findings checked in the code and accepted (null-timestamp cursor, Add Person on a short refresh, person details without the address read, sign-out ends the session). Each was a duplicate pair.

## Not in scope

- A new page, sheet or setting.
- Narrowing who may read `people` on the server.
- Scoping what a device holds (PR 3).
