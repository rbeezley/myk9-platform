# Standing approvals while pre-launch

> **Status:** Active

Linear: [MYK9-1485](https://linear.app/myk9-platform/issue/MYK9-1485). The issue was filed as "one approval queue page"; this design replaces that with standing approvals plus the existing Linear "Owner actions" view.

## Why

The owner's attention is the scarce resource on a one-person project. Local transcripts for Sept 1 – Oct 29 2026 show:

- 34% of the owner's 6,681 messages were go-aheads.
- 758 of those go-aheads were short approvals to merge, deploy, push or `db push`: about 13 a day, spread from 7 am to 10 pm.
- 279 agent questions held sessions for 24.4 h.

The owner says they "usually take the recommendation". So the cost is not where approvals are clicked; it is being interrupted for decisions they would approve anyway. A nicer approval page would keep the interruptions. Removing the routine questions removes them.

There are no real users yet: no real club, no live Stripe charges. The Oct 10 2026 show was a test show. Shared-system writes are reversible or low-stakes until that changes.

## Goals

- **Pre-approve routine shared-system actions.** While the project is pre-launch, agents do them without asking:
  - merging a PR whose required checks are green;
  - running the Deploy myK9Show workflow;
  - `supabase db push`;
  - `supabase functions deploy`.
- **One place for everything that still needs the owner:** the existing Linear "Owner actions" view (open issues labelled `needs:decision` or `needs:operator`). It is read in one sitting, not answered in chat.
- **Every pre-approved action leaves a record** on the Linear issue or PR it served: what ran, when, on which commit or migration, and the result.
- **Pre-approval ends cleanly** when the first real club arrives, by an explicit switch the owner flips, with an automatic backstop.

## Non-goals

- **A new approval page or dashboard.** The owner chose the Linear view ("Yes, that would work"), which follows the consolidate-don't-duplicate rule.
- **Removing any existing check.** The review gate, required CI, the migration guards (`qa:migrations:guard`, grant and ACL verification), "merge is not deploy" evidence, and `PUSH HOLD` all stay. Pre-approval removes the question, not the checks.
- **Codex-only workflow changes** beyond reading the same shared rules.

## Anti-goals: this fails if

- An agent deploys or pushes a migration unattended after a real club or real money exists.
- A pre-approved action happens with no trace the owner can audit later.
- Questions the owner must answer still arrive in chat as well as in Linear, so there are now two places.
- An agent treats pre-approval as permission for something on the "stays with the owner" list.

## Decided by the owner (2026-10-29)

1. Merges, Deploy myK9Show runs, `supabase db push` and `supabase functions deploy` are pre-approved while pre-launch.
2. Pre-approval ends when the first real club signs up. There are no real clubs today, and the Oct 10 club does not count.
3. The owner's single place to look is the Linear "Owner actions" view. No new page.
4. The tripwire's "real users" check is about clubs, not individual accounts: a club row that is not a known test club ends pre-approval.
5. The project's `.claude/settings.json` gets permission allow rules for exactly the four pre-approved commands, so Claude Code does not prompt for them (see § 6).

## Design

### 1. The standing-approvals file

A new `docs/agents/standing-approvals.md` is the one source of truth. It holds:

- **A status line** that agents read and match exactly: `Status: pre-launch — standing approvals ACTIVE` or `Status: launched — standing approvals OFF`.
- **The pre-approved actions**, each with the record it must leave:

  | Action                                                      | Pre-approved when                                                                                                                                                   | Record it leaves                                                                        |
  | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
  | Merge a PR (`gh pr merge --squash`, from the main checkout) | Every required check is green on the head that merges, including the review gate, per `watch-pr-checks.sh` exit 0, or exit 5 after reading the non-required failure | Closeout comment on the Linear issue, naming the merged SHA                             |
  | Run the Deploy myK9Show workflow                            | `main` is green and the tripwire passes                                                                                                                             | Comment on each issue the deploy ships, naming the run and the deployed commit          |
  | `supabase db push`                                          | The migration is merged to `main`, the tripwire passes, and the `db-push` skill's version and grant checks pass                                                     | Comment naming the migration versions, plus the post-push ACL check output              |
  | `supabase functions deploy`                                 | The function change is merged to `main`, the tripwire passes, and `--project-ref sojmvhhwsjxmfistvzbe` is used                                                      | Comment naming the function, the version and the "Deployed Functions on project …" line |

- **What stays with the owner**, never pre-approved:
  - Anything that moves real money or changes Stripe mode, including the live cutover (MYK9-11) and refunds. Refunds already require a person (Architecture Decisions).
  - Permanently deleting data, accounts or users.
  - `git push --force`, and any push to `main` other than the existing docs-only exception.
  - Vercel project settings, Supabase project settings and secrets, Linear team settings and label definitions.
  - Product and UX decisions (`needs:decision`).
  - Any action the tripwire stopped.

  This list matches the existing shared rules wherever they already say "confirm"; the file only moves the four pre-approved items out of that list.

- **How to switch it off:** change the status line, in a PR. Every session must read the file fresh before any shared-system write and must not rely on a value cached earlier in the session.

### 2. Shared-rules change

In `docs/agents/shared-rules.md` § "Auto Mode — shared-system writes":

- Add one paragraph: while `docs/agents/standing-approvals.md` says ACTIVE and its tripwire passes, the actions listed there need no confirmation. Everything else in the section is unchanged.
- Add a matching sentence to the merge rule in § Worktree & Merge Workflow and to the "merging still needs its own authorization" sentence.

Then regenerate CLAUDE.md and AGENTS.md with `pnpm qa:shared-rules:write`, so Codex follows the same rules. The LESSONS, Deployment and Gates text stays as is, except where it says a deploy is owner-only. Those lines point at the file instead.

### 3. The tripwire

A small script, `scripts/qa/prelaunch-tripwire.ts`, runs as `pnpm qa:prelaunch-tripwire` before every pre-approved deploy, `db push` and functions deploy. It exits 0 only when all of these hold:

1. The standing-approvals status line says ACTIVE.
2. `platform_settings.stripe_livemode` is false. This is the existing platform switch (migration `20261003221700`); live mode means real money.
3. **Every club is a known test club.** No row in `public.clubs` (including soft-deleted ones) has an id outside the test-club list kept in the standing-approvals file. The list is written when this ships, from the clubs that exist then; the owner confirmed none of them is real. A new club row of any kind trips it, including a test club someone adds. That fails safe: the action is parked and a person adds the id to the list. Individual accounts, such as an exhibitor signing up, do not count (owner, 2026-10-29).

It exits 1 with the reason when a check fails, and 2 when it cannot decide (for example, no database access). **Exit 2 is not a pass:** the action is not taken. Read-only queries only.

**Changed after the final review (2026-10-29):** the switch is read from both this checkout and `origin/main` (after a fetch), and both must say ACTIVE, so a worktree cut before the owner merged OFF cannot keep acting. A push runs the tripwire with `--db-push`, which computes every unpushed migration itself (local files minus `schema_migrations`) instead of trusting the files an agent names. The scanner ignores string contents and also catches `DROP SCHEMA`, `ALTER TABLE … DROP <column>` without the COLUMN keyword, and `DELETE … WHERE true`. Unknown arguments exit 2.

- **My call:** it reads through the same authenticated path the deploy and `db-push` skills already use (psql with `--db-url`, or the Supabase MCP). The builder picks whichever those skills use.
- **My call:** a failed or undecided tripwire files or updates a Linear issue labelled `needs:operator` with the reason, so it reaches the Owner actions view.
- **My call: merges run the tripwire too.** It costs one read-only query and closes the gap where merges kept going after launch. The tripwire applies to all four pre-approved actions.
- **My call: no database access means no pre-approved deploy.** Deploys, `db push` and functions deploys already run from the Mac, where database access exists. A cloud or Codex session without access gets exit 2 and parks the action. It does not run it, and it does not ask in chat.
- **My call: destructive migrations are not pre-approved.** Before a pre-approved `db push`, the skill scans the pending migrations for `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` and an unqualified `DELETE FROM`. A hit parks the push as `needs:operator`. This keeps "permanently deleting data" with the owner.

### 4. Owner questions go to Linear, not chat

When a session needs the owner (a decision, an operator action, or a tripwire stop), it:

- files or updates the Linear issue with `needs:decision` or `needs:operator`;
- writes the question, its recommendation and the evidence;
- carries on with other work, without blocking in chat.

In an interactive session, the agent still says in one line that it parked the question, and links the issue. That way the owner who is present sees it, but no answer is required right then.

**My call: when the parked question blocks the only task,** the session leaves the issue In Progress, labelled, with a comment naming the branch, the worktree and the exact question, and ends its run. This is the existing hold rule in `docs/agents/issue-tracker.md` § Dispositions and holds.

**My call:** an interactive session where the owner is actively steering (they asked for the task in this conversation) may still ask a direct product question in chat. This rule is about routine go-aheads, and about unattended or orchestrated runs.

### 5. Skill and agent updates

Each references `docs/agents/standing-approvals.md` rather than restating it:

- **`deploy` and `db-push`:** run the tripwire first; skip the confirmation step while approvals are ACTIVE; record per the table.
- **`ship-pr` and `orchestrate`** (including `references/linear-issue-run.md`): merge without asking when the merge row applies; park owner questions per § 4.
- **The scheduled-audit backstop** (`docs/operations/scheduled-audits-claude.md` Task 4): no change needed. Note in the file that it does not perform pre-approved actions.

### 6. Harness permissions (owner-approved)

Changing the rules alone would still leave Claude Code permission prompts for these commands. So the project's tracked `.claude/settings.json` gets allow rules scoped to exactly:

- `gh pr merge <n> --squash`;
- `gh workflow run deploy-myk9show.yml`;
- `supabase db push` (with the project's documented flags);
- `supabase functions deploy` with `--project-ref sojmvhhwsjxmfistvzbe`.

Nothing broader: no wildcard over `gh` or `supabase`. The builder checks the current permission and auto-mode setup first (memory notes that `Bash(*)` is already allowed and the auto-mode classifier is the real gate). The builder then adds the narrowest rules that actually stop the prompt, and verifies that each of the four runs without one. Turning approvals OFF in the standing-approvals file does not remove these rules, but the tripwire still stops each action. When launching, the owner also removes the rules (a line in the launch step of the standing-approvals file).

### 7. Memory and issue housekeeping

- Update the memory note "Pre-launch no users", which currently says shared-system writes still need confirmation, to point at the file.
- Retitle MYK9-1485 and rewrite its description and criteria to this design.
- MYK9-1495 (labels for owed work) is separate and unchanged.

## Testing

- **Tripwire, known-answer tests:**
  - ACTIVE + test mode + only known test clubs → exit 0;
  - status OFF → 1;
  - `stripe_livemode` true → 1;
  - a club id not on the test-club list (including a soft-deleted one) → 1;
  - an exhibitor account with no new club → 0;
  - database unreachable → 2;
  - a malformed status line → 2.

  Run them against a stubbed query layer, and wire them into CI like the other `scripts/qa` tests (a `*:test` script plus the launcher pin).

- **Mutation check:** break each rule in turn and watch its test go red.
- **Shared rules:** `pnpm qa:shared-rules` in sync, and the instruction-file budget test green.
- **End to end, once:**
  - one real pre-approved merge, Deploy myK9Show run and functions deploy, each done without asking;
  - each leaves its record;
  - one deliberately tripped tripwire (in a test, not by changing the live setting) parks a `needs:operator` issue and runs nothing.

## Shipping (my calls)

- The change touches `.claude/**`, CLAUDE.md, AGENTS.md and the shared rules. So it ships as one PR at the `independent` review tier (Codex), like any guardrail change.
- **"`main` is green" for a deploy** means the Deploy myK9Show workflow's own gate, since it builds the newest `main` commit with green CI.
- **The issues a deploy ships** are the `MYK9-<n>` ids in the commit subjects between the previously deployed SHA (from the last run's summary) and the new one.
- **The end-to-end proof happens after merge**, on the next real merge, deploy and functions deploy that the work produces anyway. No throwaway function is deployed. The tripwire-stop case is proven in the tests, not live.

## Left to the builder

- The exact wording of the shared-rules paragraph, within the shared-rules word budget.
- Error message wording, and the format of the Linear record comments.

---

# Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to work through the tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** routine shared-system actions run without asking while pre-launch, behind a tripwire, and owner questions go to Linear.

**Architecture:**

- One machine-readable block in `docs/agents/standing-approvals.md` is the switch and the test-club list.
- A pure TypeScript tripwire module evaluates it against two read-only database facts and an optional set of pending migrations. A thin CLI runs `psql`.
- The shared rules, four skills and the settings file point at the file rather than restating it.

**Tech stack:**

- Node with `--experimental-strip-types`, the same as the other `scripts/qa` tools;
- vitest;
- `psql`, using the `db-push` skill's `MYK9_MIGRATION_DATABASE_URL` + `PGPASSWORD` pattern;
- the Linear MCP.

**Spec:** this document, the design above.

## Global constraints

- Database URL: `MYK9_MIGRATION_DATABASE_URL`, with `PGPASSWORD` from `supabase/.env` (`SUPABASE_DB_PASSWORD`), exactly as `.claude/skills/db-push/SKILL.md:95` does. Never hard-code a password.
- Functions deploys always pass `--project-ref sojmvhhwsjxmfistvzbe` (CLAUDE.md LESSONS).
- Tripwire exit codes: 0 = pass, 1 = a check failed (with the reason), 2 = could not decide. Only 0 lets an action run.
- Read-only database access only: `select` statements.
- Files stay under 500 lines; the `qa:code-quality-ratchet` gate applies.
- Every new `scripts/qa` test is wired into CI: a `*:test` script, a `ci.yml` line next to `pnpm qa:no-ci-polling:test`, and a `required-job-launchers.pins.ts` entry.
- The shared-rules text is edited in `docs/agents/shared-rules.md` only, then regenerated with `pnpm qa:shared-rules:write`.

## Review focus

The conditions most likely to bite, each pinned by a test in the task that owns it:

1. The approvals block is missing, duplicated or misspelled. Expect exit 2, never a silent pass (Task 1).
2. `platform_settings` returns no row or a non-boolean. Expect exit 2 (Task 1).
3. A soft-deleted club whose id is not on the list. Expect exit 1, because the query reads every row (Task 1).
4. A migration that drops or deletes only inside a comment or a string. Expect no false stop for `-- DROP TABLE` comments. A real `DROP TABLE` inside a `DO $$` block is still a stop (Task 1).
5. A session that read the file earlier and then the switch flipped. The CLI re-reads the file on every run, with no cache (Task 1, CLI test).

---

### Task 1: Tripwire module, CLI and tests

**Files:**

- Create: `scripts/qa/prelaunch-tripwire.ts` (pure functions and the CLI)
- Create: `scripts/qa/prelaunch-tripwire.test.ts`
- Modify: `package.json`: add `"qa:prelaunch-tripwire": "node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/prelaunch-tripwire.ts"` and `"qa:prelaunch-tripwire:test": "vitest run scripts/qa/prelaunch-tripwire.test.ts"`
- Modify: `.github/workflows/ci.yml`: add `pnpm qa:prelaunch-tripwire:test` after `pnpm qa:no-ci-polling:test`
- Modify: `scripts/qa/required-job-launchers.pins.ts`: a pin for the new test script

**Interfaces (produces):**

- `export interface Approvals { active: boolean; testClubIds: string[] }`
- `export function parseApprovals(markdown: string): Approvals | null`. It reads exactly one fenced block tagged `standing-approvals`. That block holds a line `status: ACTIVE` or `status: OFF` and a `test-clubs:` list of `- <uuid>` lines. Missing, duplicated or malformed → `null`.
- `export function destructiveStatements(sql: string): string[]`. It strips `--` and `/* */` comments, then matches, case-insensitively, `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, and `DELETE FROM <table>` with no `WHERE` before the next `;`. It returns the matched statements.
- `export interface TripwireFacts { livemode: boolean | null; clubIds: string[] | null; migrations?: { path: string; sql: string }[] }`. Here `null` means the query failed or the answer was unreadable.
- `export function evaluateTripwire(approvals: Approvals | null, facts: TripwireFacts): { code: 0 | 1 | 2; reason: string }`
- CLI usage: `pnpm qa:prelaunch-tripwire [--migration <path>]...`.
  - It reads `docs/agents/standing-approvals.md` fresh on each run.
  - It runs `select stripe_livemode from public.platform_settings where id = true;` and `select id from public.clubs;` through an injectable `command` (the `migration-version-guard.ts` pattern).
  - It prints the reason and exits with the code.

- [ ] **Step 1: Write the failing tests.** These are the known-answer cases; each asserts `evaluateTripwire(...)` deep-equals `{ code, reason: expect.stringContaining(...) }`:

  | Case                                                     | Expected             |
  | -------------------------------------------------------- | -------------------- |
  | `parseApprovals` returns `null`                          | 2, "approvals block" |
  | `active: false`                                          | 1, "OFF"             |
  | `livemode: null`                                         | 2, "stripe_livemode" |
  | `livemode: true`                                         | 1, "live"            |
  | `clubIds: null`                                          | 2, "clubs"           |
  | a club id not in `testClubIds`                           | 1, naming that id    |
  | all clubs listed, `livemode: false`, no migrations       | 0                    |
  | a migration with `DROP TABLE public.x;`                  | 1, naming the file   |
  | a migration whose only `DROP TABLE` is in a `--` comment | 0                    |

  Plus: `parseApprovals` returns `null` for two blocks, a missing `status:` line, and a status of `active` in lower case.

  Plus a CLI test with a stub `command`. It writes a temp approvals file, runs once (exit 0), flips the file to OFF, runs again, and expects exit 1. That proves there is no caching.

- [ ] **Step 2: Run the tests and confirm they fail.**
      `pnpm vitest run scripts/qa/prelaunch-tripwire.test.ts`. Expected: FAIL (the module does not exist).

- [ ] **Step 3: Implement the module and the CLI** with the signatures above. Check order: approvals, then livemode, then clubs, then migrations. The first failure wins.

- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm qa:prelaunch-tripwire:test` (EXIT=0), then the same with `--sequence.shuffle`.

- [ ] **Step 5: Mutation check.** Break, one at a time:
  - the active check;
  - the livemode check;
  - the club-membership check;
  - the comment stripping;
  - the `WHERE` exception;
  - the fresh read.

  Each must turn a named test red.

- [ ] **Step 6: Wiring checks.**
      `pnpm vitest run scripts/qa/scripts-test-wiring.test.ts scripts/qa/required-job-launchers.test.ts`, `pnpm typecheck:scripts`, and eslint plus prettier on the new files. All EXIT=0.

- [ ] **Step 7: Commit:** `feat(qa): pre-launch tripwire for standing approvals (MYK9-1485)`.

### Task 2: The standing-approvals file

**Files:**

- Create: `docs/agents/standing-approvals.md`

**Interfaces:**

- Consumes `parseApprovals` (Task 1). The fenced `standing-approvals` block must parse.

- [ ] **Step 1: Read the club ids, read-only.**
      Run `select id, name, deleted_at from public.clubs order by created_at;` through the Supabase MCP `execute_sql` tool. Record the list in the PR body. The owner has confirmed none is real (2026-10-29).

- [ ] **Step 2: Write the file.** It contains:
  - the block: `status: ACTIVE`, plus every id from Step 1 under `test-clubs:`;
  - the actions table and the "stays with the owner" list, from design § 1;
  - the destructive-migration rule;
  - the "read fresh before every shared-system write" rule;
  - the launch steps: set `status: OFF` in a PR, remove the § 6 allow rules, and update the memory note.

- [ ] **Step 3: Verify the real file parses and passes.**
  - `node … -e` importing `parseApprovals` on the real file returns `active: true` and the ids.
  - `MYK9_MIGRATION_DATABASE_URL=… PGPASSWORD=… pnpm qa:prelaunch-tripwire` exits 0 against the live project.

- [ ] **Step 4: Commit:** `docs(agents): standing approvals while pre-launch (MYK9-1485)`.

### Task 3: Shared rules, CLAUDE.md and AGENTS.md

**Files:**

- Modify: `docs/agents/shared-rules.md`. In § "Auto Mode — shared-system writes", add the paragraph from design § 2. In § "Worktree & Merge Workflow" rule 7 and in the "merging still needs its own authorization" sentence, add "unless `docs/agents/standing-approvals.md` covers it".
- Modify: the § Deployment bullet "Running it is a shared-system write: only when the user asks". Point it at the file.
- Regenerate: `CLAUDE.md` and `AGENTS.md` via `pnpm qa:shared-rules:write`.

- [ ] **Step 1: Edit `shared-rules.md`, then run `pnpm qa:shared-rules:write`.**
- [ ] **Step 2: Verify.**
      `pnpm qa:shared-rules` reports "in sync". `pnpm --filter @myk9/show vitest run src/test/ci/instructionFileBudget.test.ts` EXIT=0 (the word ceilings).
- [ ] **Step 3: Commit:** `docs(rules): standing approvals in the shared rules (MYK9-1485)`.

### Task 4: Skills

**Files:**

- Modify: `.claude/skills/deploy/SKILL.md` and `.claude/skills/db-push/SKILL.md`.
  - Before a live write, run `pnpm qa:prelaunch-tripwire`. For a push, add `--migration <file>` for each pending migration.
  - On exit 0, proceed without asking and leave the record from the design § 1 table.
  - On 1 or 2, do not run the action. Park it as `needs:operator` with the reason.
- Modify: `.claude/skills/ship-pr/SKILL.md`, `.claude/skills/orchestrate/SKILL.md` and `.claude/skills/orchestrate/references/linear-issue-run.md`.
  - Merge without asking when the merge row applies and the tripwire exits 0.
  - Park owner questions in Linear per design § 4, using the existing hold rule.
  - The existing review gate and watcher steps are unchanged.
- Modify: `docs/operations/scheduled-audits-claude.md` Task 4. Add one line: it never performs pre-approved actions.

- [ ] **Step 1: Make the edits.** Each skill links the file rather than restating the list.
- [ ] **Step 2: Verify.**
  - `pnpm vitest run scripts/qa/db-push-sweep.test.ts` EXIT=0. It reads `db-push/SKILL.md`, and its sweep snippet must be untouched.
  - The skill-tree test in `apps/myk9show` EXIT=0.
  - `grep -rn "only when the user asks" .claude/skills docs/agents` returns no line that contradicts the file.
- [ ] **Step 3: Commit:** `docs(skills): run pre-approved actions behind the tripwire (MYK9-1485)`.

### Task 5: Harness permissions

**Files:**

- Modify: `.claude/settings.json`, `autoMode.allow`.

- [ ] **Step 1: Read the current setup.** Note the project `autoMode.allow` and the user-level entry that already covers `gh pr merge`. Do not edit user settings.
- [ ] **Step 2: Add three project `autoMode.allow` entries.** Each says the action is pre-approved while `docs/agents/standing-approvals.md` is ACTIVE and `pnpm qa:prelaunch-tripwire` exited 0 in the same session:
  - `gh workflow run deploy-myk9show.yml`
  - `source supabase/.env && supabase db push --password "$SUPABASE_DB_PASSWORD"` (with optional `--include-all`)
  - `supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe`

  Also add a merge entry (`gh pr merge <n> --squash` run from the main checkout), so the project does not depend on the user-level setting. No wildcard over `gh` or `supabase`.

- [ ] **Step 3: Verify.** `python3 -I -c "import json;json.load(open('.claude/settings.json'))"` parses. Each of the four runs without a prompt is checked at the end-to-end step (Task 7).
- [ ] **Step 4: Commit:** `chore(claude): auto-mode allow for pre-approved actions (MYK9-1485)`.

### Task 6: Index, memory and Linear

- [ ] **Step 1:** Add a row to `docs/README.md`:
      `| [plan-standing-approvals.md](plan-standing-approvals.md) | Active | Standing approvals while pre-launch |`
      Format it with prettier.
- [ ] **Step 2:** Rewrite MYK9-1485's title and description to this design (Linear updates are pre-authorized).
- [ ] **Step 3:** After merge, update the memory note "Pre-launch no users" so it points at the file.
- [ ] **Step 4: Commit** the index row with Task 2's commit or separately: `docs: index the standing-approvals plan (MYK9-1485)`.

### Task 7: Testing and ship

- [ ] **Step 1: Run every check.**
  - `pnpm qa:prelaunch-tripwire:test --sequence.shuffle`;
  - the wiring and pin tests;
  - `pnpm typecheck:scripts`;
  - `pnpm qa:shared-rules`;
  - the instruction budget test;
  - `pnpm qa:code-quality-ratchet`.

  All EXIT=0.

- [ ] **Step 2: Ship as one PR at the `independent` tier.** Pre-pass, then the Codex review run in the background, then `watch-pr-checks.sh`. The merge needs the owner's go-ahead, because the standing approval is not active until this PR merges.
- [ ] **Step 3: End-to-end after merge**, on the next real work:
  - one merge, one Deploy myK9Show run and one functions deploy, each with no prompt and no chat question;
  - each with its record on the issue;
  - the tripwire run before each is logged.

  Record this on MYK9-1485. If a prompt still appears, narrow the cause (classifier versus permission) and fix it in a follow-up commit.

- [ ] **Step 4: Close out.** On merge, set Status to Complete, `git mv` this file into `docs/archive/`, and drop the index row (CLAUDE.md § Planning).

## Risks

- **A session misses the switch flip.** This is mitigated by reading the file fresh before each shared-system write, and by the tripwire's own status check.
- **The test-club list goes stale.** A new test club would trip it. That fails safe: the action is parked, not taken, until someone adds the club's id.
- **Pre-approved merges run with less human scrutiny.** The review gate and required checks are unchanged, and those were already what the owner's approval rested on.
