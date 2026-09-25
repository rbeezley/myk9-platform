# `role-intent-walk` — Role intent walk

> Scheduled-task prompt, read by the task at run time from `origin/main` (MYK9-733). The installed `~/.claude/scheduled-tasks/role-intent-walk/SKILL.md` is only a pointer to this file; edit here, through review. How the two relate, and how a run's corrections come back into this file: [README](README.md).

# Part 1 — The job, the boundary and the output (stable)

Run an INTENT-driven UX walk of ONE myK9Show role in a real browser.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Which role — rotate by ISO week

week mod 3 == 0 -> judge
week mod 3 == 1 -> club-admin
week mod 3 == 2 -> site-admin

State the computed week number and chosen role at the top of the report so the rotation is auditable.

**Exhibitor and secretary are deliberately NOT in this rotation.** They have dedicated weekly walks (`exhibitor-task-walk`, `secretary-task-walk`) that already carry the INTENT framing, so including them here bought a fifth-week revisit of well-covered roles while the three roles nothing else touches waited five weeks each. Do not add them back. **Steward is also excluded, and for a different reason: there is no steward sign-in.** `apps/myk9show/src/test/e2e/helpers/testUsers.ts` states that steward flows use the canonical secretary account, so a steward slot would silently re-walk as the secretary and report it as steward coverage. If a distinct steward actor is ever seeded, revisit this.

## What this walk asks

`secretary-task-walk` and `exhibitor-task-walk` ask whether the job WORKS. This one asks whether it FEELS the way it is supposed to. Read `docs/INTENT.md` and the matching `docs/roles/<role>.md` first and establish the target feeling before you walk anything:

- **Judge** — "Invisible technology"
- **Club admin** — see `docs/roles/club-admin.md`
- **Site admin** — "The platform is healthy"

A finding here is not only "this is broken." It is also "this is technically correct and it does not feel the way INTENT.md says it should for this role." Rate on that basis rather than dismissing it as cosmetic. This is the only scheduled task applying that lens to these three roles.

Use the `role-journey-ux-audit` skill, which pulls in `UX-Audit` for methodology, `audit-pages` for the route inventory, and `quality-finding-lifecycle` for findings.

Persona: elderly, nontechnical, first-time user unless INTENT.md says otherwise for this role.
Viewports: fully walk mobile and desktop, then use tablet as a responsive-difference pass.

## Isolation

Work in your OWN git worktree cut from `origin/main`, and use a unique vite port. A shared checkout gets corrupted by concurrent agents. Do not run in the primary checkout.

## Credentials — read this before signing in

Sign in with the `@myk9t.com` set. The old `e2e-*@test.myk9.com` domain was RETIRED on 2026-08-23 and has no `auth.users` rows; any prompt or doc still naming it is stale.

- judge -> `judge@myk9t.com`, `E2E_JUDGE_PASSWORD`. This account is JUDGE-ONLY and the "only" is load-bearing (MYK9-141) — `seed-demo.sql` §10g deactivates every non-judge grant so judge-scoping checks cannot pass through the wrong branch. If it renders as `Secretary +2`, that is a finding, not a fixture quirk.
- site-admin -> `testadmin@myk9t.com`, `E2E_ADMIN_PASSWORD`.
- club-admin -> `clubadmin@myk9t.com`, `E2E_CLUB_ADMIN_PASSWORD`. The email is hard-coded in the seeds and deliberately NOT overridable. This actor is club-scoped ONLY, with no site_admin, because club gates read `is_site_admin() OR is_club_admin(id)` and signing in as the site admin satisfies them without ever testing club scoping (MYK9-137). If `E2E_CLUB_ADMIN_PASSWORD` is absent from `apps/myk9show/.env.local`, that week's walk cannot run as the right actor — record it as a coverage gap and do NOT substitute the site admin.

Passwords live in `apps/myk9show/.env.local` (gitignored). Read them from the environment at runtime. Never print, log, or write a credential into a report or screenshot. If sign-in fails with `Invalid login credentials`, that is auth-state drift, not an app bug — report it and stop rather than debugging the app.

## Safe mutation boundary

Create and edit demo records freely. Do NOT delete records you did not create, do not touch payment or payout flows, and do not run anything against production.

**Anchor every destructive click to the row that owns it** — `locator('li', {hasText: target}).getByRole('button', ...)`, never `.last()` or `.first()` into a list whose length you did not assert. **Never assume a confirm dialog exists**: assert it appeared before looking inside it, and scope the confirm to `[role="dialog"]`. On 2026-08-31 a page-wide `.last()` fallback destroyed the canonical CI secretary's own appointment because Revoke has no confirmation step (MYK9-284). Record the count you expect after a destructive action and assert it.

## Judge week — also run the scoring replay

On a judge week (week mod 3 == 0), run this BEFORE writing the report:

    cd apps/myk9show && pnpm test:e2e:audit:judge

It covers what a hand-driven walk cannot: scoring offline, restart durability, reconnect and queue drain, a version-conflicted score, and duplicate submission. Every shared-staging write is intercepted, and it fails closed rather than writing if it cannot confirm that. If the walk already has an app server up, attach to it rather than letting the runner start a second one:

    PLAYWRIGHT_AUDIT_BASE_URL=http://127.0.0.1:<port> \
      PLAYWRIGHT_AUDIT_SERVER_ID=<the server's VITE_AUDIT_SERVER_ID> \
      pnpm test:e2e:audit:judge

Cite the run in the report: pass/fail per case, plus the `shared-staging-write-ledger.json` attachment, which is the evidence that shared staging received no writes. A failure here is a P1 — it is the show-day path with the least tolerance for breakage.

Note the trap this replay guards against: a harness flag that defaults to intercepting writes can also make an absence-assertion vacuous. If a case asserts that no RPC was called, confirm it can observe a positive case on the same collector, or it is proving nothing.

## Judgment rules

- The project is **pre-launch, consolidating not expanding**. A duplicated surface is itself a finding. Prefer "link these two existing surfaces" over "add a page". If you propose a new surface, answer explicitly: does this duplicate an existing page, and why is duplication justified instead of a link?
- Code that looks wrong but carries an `// INTENT:` comment is deliberate — read it before calling it a defect.
- Verify claims against the running app, not against source text. A comment naming a behaviour is not evidence the behaviour exists.
- An empty result is not evidence of emptiness. A disabled query, a query paused offline, and a placeholder from a previous key all render `isLoading: false` with no data, and the UI states that as fact. Cross-check the database before reporting a "you have nothing" screen.

## Output

- Write the report to `docs/audits/YYYY-MM-DD-<role>-intent-walk.md`.
- Tag every finding `source: claude`, assign canonical P0-P3 severity, and mark each new / unchanged / regressed / resolved against prior runs.
- Include a coverage matrix of routes walked vs. routes skipped. A skipped route is a coverage gap, not a pass.
- Append the compact lifecycle ledger to automation memory.
- **File findings to Linear directly — there is no approval step.** This run is unattended; an approval gate means nothing is ever filed and the report dies with the worktree. Every confirmed non-duplicate P0/P1 gets its own issue (team **MyK9-platform**), labelled `Claude` plus `Bug` (or `Improvement`), with severity in Linear's **priority field**: P0/P1 → Urgent, P2 → High, P3 → Low. The labels `p0`/`p1`/`source:claude`/`walk:<role>` do NOT exist in this workspace, and creating labels unattended is a shared-system change this walk has no mandate for. Put `walk:<role> <YYYY-MM-DD>` as the description's first line so walk issues stay searchable. Group P2/P3 as sub-issues of ONE parent titled `<Role> intent walk <YYYY-MM-DD> — P2/P3 findings`.
- **Dedupe before filing, always with `includeArchived: true`** — match on route/symptom, never on title. Auto-archive runs on a 30-day team setting, so a default query reads shipped work as never-seen and re-files it. If an issue exists, comment on it instead of opening a second.
- **Do NOT file coverage gaps or probe/harness bugs as issues** — report body only. A probe bug filed as a defect costs a triage slot and points the next run at a problem that does not exist.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled.
- **Commit the report and push it to `main`.** Docs-only, per CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file and, if you applied a Part 2 correction, this walk's own file — and that `git diff` of the walk file changes nothing above its `# Part 2` line.
- **Prompt corrections section.** List every statement in this walk's file, `docs/qa/walks/role-intent-walk.md`, that the run found stale, with the evidence. A correction that falls below the file's `# Part 2 — Known mechanics` line you apply yourself, in the same commit as the report (see Hard constraint): that part exists to churn, and a correction that waits for a human is re-derived by every run in between. A correction to anything ABOVE that line — the job, the safe mutation boundary, the output and filing rules — is listed here only, and a human makes it through a reviewed PR. Never weaken a safety rule from Part 2 either: if a mechanic conflicts with the boundary, the boundary wins and the conflict goes in this section.
- Never emit credentials, tokens, or PII into the report.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no pushes beyond the report file, no `supabase db push`, no function deploys. If you find something trivial to fix, still do not fix it — record it and let a human decide. The only repo writes permitted are committing and pushing your own report file and, in that same commit, Part 2 corrections to this walk's own file, per the Output section above.

# Part 2 — Known mechanics (expected to churn)

Everything below this line is measured fact about the app, the fixtures and the open issues, and goes stale. A run may correct it in the same commit as its report (Output, "Prompt corrections"). Nothing below may relax Part 1.

## Regression re-verification

Re-walk any finding from this role's last two walks that is marked fixed and confirm it holds **in the browser**. A finding that regressed is a P1 regardless of its original severity. Explicitly list which prior findings you re-verified and which you could not reach.
