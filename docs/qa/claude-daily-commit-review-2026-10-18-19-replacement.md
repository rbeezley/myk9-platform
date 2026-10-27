# Daily commit review — 2026-10-18/19 replacement evidence

source: claude. **Replacement evidence, not the original reviews.** The Codex reviews that covered
this range on 2026-10-18 and 2026-10-19 were written as untracked files in temporary worktrees
(`/private/tmp/myk9-ncr-20261018`, `…-20261019`) and were lost when those worktrees were removed.
Untracked files never enter Git's object store, so they could not be recovered. This report is a
fresh review of the exact same range, run on 2026-10-26 under
[MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) by the owner's decision of that day.

**43 of 43 commits reviewed. No confirmed finding is still live on current `main`.** One regression
introduced in the range was already fixed by a later commit. No Linear issue was created or modified
for findings; none qualified.

## Coverage

- **Interval:** `(0952bffb22678c4382587a6f8edeedcb80ca6346, 3fab98f7d8ea27eff6e8793aff8612ed679f6474]`.
  `git rev-list --count 0952bffb2..3fab98f7d` returns 43; the inventory below lists all 43. Commit
  dates 2026-10-14; window end (last commit) 2026-10-15T02:21:46Z. 214 changed paths, +9514/−1095.
- **Cursor:** not moved. The `daily-commit-review` row already stands well past this range
  (`956f6ce01`, 2026-10-26). This run fills an evidence gap behind the cursor; it is not a stamp.
- **Verification baseline:** `9ab650fc5` (current `main` at review time). Source was reviewed at each
  commit; whether a candidate is still live, and every focused test, was checked on the baseline.
- **Method:** two read-only reviewers, one per half (first 21 / last 22), in the dedicated worktree
  `/private/tmp/myk9-1343-reports` off a clean `origin/main`, bootstrapped (exit 0). No application
  code changed. Each commit was read with its full surrounding implementation; candidates were
  checked against later commits on the same paths and `docs/qa/findings.md` (no entries for any issue
  in the range).
- **Neighbours:** the next contiguous coverage starts at `3fab98f7d` in
  `docs/qa/codex-daily-commit-review-2026-10-20.md`. The range before `0952bffb2` is covered by
  `docs/qa/codex-daily-commit-review-2026-10-17.md`.

## Commits reviewed

| SHA         | Kind                       | Subject                                                                           | Verdict                 |
| ----------- | -------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| `554046a07` | test + tooling             | waitlist journey pays on Stripe test-mode Checkout (MYK9-971) (#2983)             | clean                   |
| `8ad6da58d` | docs                       | weekly Claude security audit 2026-10-14                                           | clean (docs-only)       |
| `69159dd9a` | test (e2e)                 | Stripe Checkout "Pay with card" accordion locator (MYK9-971) (#2985)              | clean                   |
| `0b932fd09` | app source + test          | "Ready for show day" roll-up on the secretary Overview (MYK9-1145) (#2986)        | clean                   |
| `7585662e5` | docs                       | judge intent walk 2026-10-14                                                      | clean (docs-only)       |
| `3ce11fc03` | app source + test          | judge dashboard counts use the ringside entry-accounting rule (MYK9-1166) (#2991) | clean                   |
| `69618fcd2` | app source + test          | reopening a scoresheet keeps the ring entry time (MYK9-1169) (#2990)              | clean                   |
| `ff4e70a86` | app source (UI)            | announcements bar is a 44px target with 14px+ text (MYK9-1168) (#2993)            | clean                   |
| `bdd76098c` | docs                       | show-day walk 2026-10-14                                                          | clean (docs-only)       |
| `23cfba847` | app source + test          | Your ring cards name their trial and day (MYK9-1165) (#2994)                      | clean                   |
| `dd5c79a9d` | app source + test          | My Stats ignores deleted shows and classes (MYK9-1164) (#2992)                    | clean                   |
| `2b0460a50` | docs                       | exhibitor task walk 2026-10-14 (E54–E63)                                          | clean (docs-only)       |
| `5af25844b` | app source + test          | Past tab never offers Start Judging; no invented 12:00 AM (MYK9-1167) (#2996)     | clean                   |
| `5d81020f9` | test                       | ResultsTab real-replica waits get an 8s budget (MYK9-1160) (#2997)                | clean                   |
| `eb0be0063` | test (e2e)                 | Results journey step 9 reloads only on a lazy-chunk failure (MYK9-1161) (#2998)   | clean                   |
| `3b1265da1` | migration + app + SQL test | dog registration writes scoped; judge sign-off columns guarded (MYK9-1155/1159)   | clean                   |
| `600077ef6` | edge function + test       | askq class summary reads Q/NQ through the caller's results view (MYK9-1156)       | clean                   |
| `daa64e6df` | migration + app + SQL test | freeze an account holder's dog's ownership (MYK9-1158) (#2989)                    | clean                   |
| `3bd82bcfb` | app CSS + e2e              | landing step circles the same size (MYK9-1141) (#3000)                            | clean                   |
| `5d87c89fa` | app source + test          | entry-decision email status loads on a large show (MYK9-1186) (#2999)             | clean                   |
| `0d2d59d0e` | app + migration + tests    | Add Dog asks for the registration number first (MYK9-1162) (#2995)                | clean (limit noted)     |
| `fa044afa4` | app source + test          | failed route chunk recovers with one guarded reload (MYK9-1188) (#3001)           | clean                   |
| `53a813030` | test (e2e)                 | offline Discard restores the dog on every dog screen (MYK9-1124) (#3002)          | clean                   |
| `bbe00a29e` | app source + test          | "Scores match the paper" waits for the class sync state (MYK9-1175) (#3004)       | clean                   |
| `9341bc218` | app source + test          | lifecycle email job reads page past the 1000-row cap (MYK9-1187) (#3005)          | clean                   |
| `8b6537f08` | app source + test          | Career results skip deleted entries; released results only (MYK9-1177/1178)       | clean                   |
| `8691bf2d3` | app source + test          | per-dog result withholds placement before release (MYK9-1179) (#3007)             | clean                   |
| `eda865276` | app source + test          | multi-day class rows in date order (MYK9-1172) (#3008)                            | clean                   |
| `6cec08763` | app source + test          | judge My Stats shows the show's own calendar date (MYK9-1174) (#3009)             | clean                   |
| `2b8ed7761` | app source + test          | all-classes list has no permanent "not loaded" count (MYK9-1184) (#3010)          | clean                   |
| `3551afbad` | app source + test          | paid banner counts classes; drops "will review it next" (MYK9-1183) (#3011)       | clean                   |
| `df1e621fb` | test (replication)         | account-switch test waits for a real download-started signal (MYK9-1185) (#3013)  | clean                   |
| `d79b3eb37` | app source + test          | "Next up" only on today's run (MYK9-1173) (#3012)                                 | clean                   |
| `f6087d8e3` | app source + test          | Message Center opens on the tab with unread items (MYK9-1180) (#3014)             | clean                   |
| `97233c64a` | app source + unit + e2e    | wizard class checkboxes name the dog, element and level (MYK9-1181) (#3015)       | resolved by `37e88deed` |
| `54f1db465` | app CSS                    | "Show day is here" banner wraps at phone width (MYK9-1182) (#3016)                | clean                   |
| `41d75dc5b` | app source + test          | show stays on the judge's upcoming list through its last evening (MYK9-1194)      | clean                   |
| `259ed9e89` | app source + test          | hung class sync read escalates by time (MYK9-1190) (#3020)                        | clean                   |
| `cd42aadf4` | app source + test          | class callout makes no place-in-line claim on a future day (MYK9-1195) (#3018)    | clean                   |
| `d2d6d1d12` | app source + e2e + docs    | exhibitor show page no longer pans sideways on a phone (MYK9-1192) (#3023)        | clean                   |
| `3943f2f1a` | app source + test          | same-day classes in start-time order (MYK9-1193) (#3022)                          | clean                   |
| `9ea33faa2` | app source + test          | trials share one judges and hide-counts read per sync (MYK9-1170) (#3025)         | clean                   |
| `3fab98f7d` | app source + test          | Results tab and timeline order classes by clock time, untimed last (MYK9-1200)    | clean                   |

## Findings

**None open.** Counts: new 0 · unchanged 0 · resolved 0 · duplicate 0 · rejected 7 · blocked 0.
Fixes found in subsequent commits: 1 regression, plus 4 refinements listed below.

### Introduced in range, already fixed on `main`

- **`97233c64a` broke five Playwright registration sites.** It renamed the class-chip accessible name
  from "Select <level>" to "Enter <dog> in <element> <level>" but updated only
  `secretary-entry-walk.spec.ts`; `wizardChips.ts` and four registration specs kept the old name, and
  Playwright Regression was red on `main` from 2026-10-14. **Resolved by `37e88deed`** (MYK9-1219,
  #3064), which added a shared `classChipName` helper and a unit pin. Evidence taken from that
  commit's diff; the failing CI run was not re-read.

### Later refinements (not defects at review time)

- `bbe00a29e` / `259ed9e89`: a read settling after unmount could still set state — hardened by
  `ea271e537` (MYK9-1203).
- `9341bc218`: per-job failures inside a 200 response were counted, not named — refined by
  `54d66c7d3` (MYK9-1191) and `c5ccc0052` (MYK9-1199).
- `fa044afa4`: real-browser proof depended on the Chromium version — addressed by `04660ace0`
  (MYK9-1248).

### Rejected candidates

- `d79b3eb37`: before the trial timezone loads, `isFutureDay` returns false, so a future day can
  briefly make a place-in-line claim. Transient, and the documented "no resolved zone, no claim" rule.
- `41d75dc5b`: the upcoming cutoff uses the device-local day; matches the later deliberate local-day
  policy in `da03a770a` (MYK9-1198) and errs toward keeping the show listed.
- `9ea33faa2`: possible cross-account sharing of an in-flight read — the share key carries the
  persisted auth user id.
- `daa64e6df`: `dog_has_account_holder(uuid, uuid)` is SECURITY DEFINER and granted to
  `authenticated`, answering one bit about an arbitrary person UUID. Needed so the trigger and UI do
  not depend on the caller's people read access; below the P3 bar.
- `0d2d59d0e`: `registry_identity_taken` answers yes/no about a registration number by design
  (owner-approved in its OpenSpec change); anon is revoked; `search_path = public, pg_catalog` with
  every reference schema-qualified is hygiene only.
- `5af25844b`: a class completed today also appears in the "Past" tab while its empty state says
  "earlier show days". Cosmetic, and the bucketing predates this commit.
- `3ce11fc03`: `checkedInEntries` counts only `checked-in`; the filter predates this commit.

Also checked and clean: `3b1265da1`'s sign-off trigger cannot break ordinary class saves
(`ReplicatedClassesTable` strips `judge_signed_off_*` from uploads); its any-secretary INSERT arm is
deliberate (the `(dog_id, organization)` unique index means an insert only fills a missing registry);
no SECURITY INVOKER path writes `dogs.owner_id`, so `daa64e6df`'s trigger blocks nothing legitimate;
`3943f2f1a`'s embedded `classes.start_time` has column grants `anon=r`, `authenticated=r` on the live
database, and all 56 non-null stored times parse.

## Checks run (on `9ab650fc5`)

| Check                                                                               | Result                       |
| ----------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm vitest run` — 35 app test files touched by the first 21 commits               | exit 0 · 35 files, 355 tests |
| `pnpm vitest run` — 28 app test files touched by the last 22 commits                | exit 0 · 28 files, 435 tests |
| `pnpm vitest run` — 4 `scripts/qa` isolated-e2e and SQL-runner test files           | exit 0 · 4 files, 52 tests   |
| `pnpm vitest run --root ../.. supabase/functions/_shared/askq/toolExecutor.test.ts` | exit 0 · 12 tests            |
| `packages/replication`: `syncReplicatedTable.accountOwnership.test.ts`              | exit 0 · 24 tests            |
| Read-only SQL: `classes.start_time` type, parseability, column ACL                  | as stated above              |
| `git show --name-only` on the four docs commits                                     | docs-only confirmed          |

One first attempt exited 127 because macOS has no `timeout`; re-run without it. Not a product signal.
`AddDogPanel.shortcutFocus.test.tsx` was not run: `0d2d59d0e` deleted it on purpose.

## Verification limits

- **Behavioral SQL tests run only in CI** and were not run here:
  `myk9_941_dog_registrations_co_owner_writes_test.sql`, `myk9_1030_judge_sign_off_test.sql`,
  `dogs_update_secretary_created_dogs_test.sql`, `myk9_1162_registry_identity_taken_test.sql`.
- **No Playwright or browser runs.** Not exercised: the waitlist Stripe leg, results journey, landing
  geometry, Add Dog, offline Discard, no-sideways-scroll, chunk-recovery service worker and
  registration specs. CSS-only changes were not checked visually.
- **Unit runs were unshuffled**; full suite, typecheck and lint were not run.
- **`0d2d59d0e` (58 files):** the migration, lookup, server check, `RegistrationIdentityStep` and
  OpenSpec proposal were read and its unit tests run; not every changed test line was read.
  **Unconfirmed edge case, not filed:** a secretary's existing-dog match depends on the device's dog
  list being complete. While it is still loading she could see the exhibitor-facing "already
  registered… contact the show secretary" message. The code re-reads the device after the server
  answers, which narrows this; it was not reproduced.
- Edge-function send paths for lifecycle emails were reviewed only as far as the client contract.
- This replaces the lost reports' coverage; it cannot reproduce what those reports recorded, and
  findings they may have filed are not inferred here.
