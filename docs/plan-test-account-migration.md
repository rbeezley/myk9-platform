# Plan: Test Account Migration — `test.myk9.com` → `myk9t.com`

> **Status:** Active

Move every fixture account off `test.myk9.com`, which is undeliverable, onto `myk9t.com`, where
real mailboxes exist. Prune the accumulated junk in `auth.users` at the same time.

## Why now

`test.myk9.com` has **no MX record but does have an A record** (`66.96.163.137`). Mail to it does
not bounce at DNS — it falls back to that host, which belongs to someone else, and is rejected
there with `550 … No unauthenticated relaying permitted`. 22 of 69 logged sends have bounced this
way, a 32% bounce rate on a domain whose sender reputation we need for real exhibitor mail.

`myk9t.com` has real MX (`mx1`/`mx2.hostinger.com`) and real mailboxes, so a test send can be
*read* rather than inferred from a provider dashboard. That closes the gap found in MYK9-228: the
packet reported delivered while nobody could produce the email.

## Target account set

Twelve accounts. Every one has a real mailbox. The eight below are the sign-in fixtures;
`exhibitor1/3/4/5@myk9t.com` stay as demo fixture data (see "Kept" below).

| Address | Source | Roles |
| --- | --- | --- |
| `secretary@myk9t.com` | rename `e2e-secretary@` | secretary, steward, exhibitor |
| `exhibitor@myk9t.com` | rename `e2e-exhibitor@` | exhibitor |
| `exhibitor2@myk9t.com` | **already exists** (`a1000002…`) — grant roles | exhibitor |
| `judge@myk9t.com` | rename `e2e-judge@` | judge ONLY (see invariant below) |
| `testadmin@myk9t.com` | rename `e2e-admin@` | site_admin, exhibitor |
| `steward@myk9t.com` | rename `e2e-steward@` | steward, exhibitor |
| `clubadmin@myk9t.com` | **create** — no auth user ever existed | club_admin ONLY |
| `chairman@myk9t.com` | **create** | chairman |
| `exhibitor1/3/4/5@myk9t.com` | keep as-is | none — demo fixture data |

Two role changes fall out of this, both deliberate:

- `e2e-admin@` currently holds `chairman` and `club_admin` on top of `site_admin`. Both move to
  their own accounts, so `testadmin@` keeps `site_admin` + `exhibitor` only.
- `clubadmin@` must hold **no** site-wide role. Club gates read
  `is_site_admin() OR is_club_admin(id)`, so an actor that is also a site admin satisfies them
  through the site branch and never exercises club scoping (MYK9-137).

### Invariant to preserve

`judge@myk9t.com` must hold **judge and nothing else**. `seed-demo.sql` section 10g deactivates
every non-judge grant on that address. A judge that also holds exhibitor or secretary clears
judge-only authorization through the wrong branch, so "a judge is denied the secretary surface"
passes whether or not judge scoping exists (MYK9-141).

## Being deleted

### The empty-judge fixture — removed entirely

`e2e-judge-empty@test.myk9.com` is declared in both fixture files, provisioned by
`setup-e2e-test-users.ts`, asserted by two contract tests, and forwarded as
`E2E_JUDGE_EMPTY_PASSWORD` through four `nightly-e2e.yml` steps.

**No e2e spec signs in as it, and no auth user for it has ever existed.** The two contract
assertions are self-referential — they assert the fixture *declaration* appears in the setup
script, not that anything works. Its intended purpose (a judge with zero assignments, for the
empty-dashboard state) was never written.

Removing: both fixture definitions, the setup-script entry, the two contract assertions, the four
workflow secret forwards. If the empty-dashboard test is wanted later, the fixture is five lines
and should be added together with the spec that uses it.

### Junk auth users — 11 remaining

All verified to have zero dogs, zero entries, and zero rows across the 88 FK columns pointing at
`people` or `auth.users`:

`e2e-clubadmin@test.myk9.com` (a typo variant of the hyphenated fixture that got provisioned once
and kept active `club_admin` privileges nothing uses) · `codex-onboarding-…@myk9t.com` ·
`codex.exhibitor.…@example.com` · `e2e-signup-…@myk9t.com` · `test-signup-…@myk9t.com` ·
`onboarding-audit-…@test.myk9.com` · `rls-test-sec1/sec2@myk9test.invalid` · `mariana@mykt9.com`
(typo domain) · `maria@` / `mariab@` / `mariana@myk9t.com` · `richard@myk9t.com`.

Already deleted (2026-08-23, separately authorised): `just1harry@gmail.com` and
`noraust.dogs@gmail.com`, with their 1 `email_log` row, 1 `user_roles` grant, 1
`exhibitor_profile`, 1 `people` row and 2 `auth.identities`.

Left in place, not classified as test data: `beezley@cox.net`, `richardbeezley1@gmail.com`,
`sherry.thompson49@yahoo.com`, `lbeezley@cox.net`.

### Kept — `exhibitor1/3/4/5@myk9t.com`

Created by migrations `152`, `177`, `178`, `20260618140000`, `20260709120000` with fixed ids
(`a1000001…`–`a1000005…`) and referenced by `testUsers.ts` as `EXHIBITOR_2..5` demo fixture data.
They hold no roles and no `people` rows today.

Richard is creating real mailboxes for them, so they stay and need no code change at all — they
are already on `myk9t.com`. This also removes the need for a prune migration, which would have
been the only durable way to delete them: a migrations-only rebuild recreates whatever the
migrations create, and CI replays migrations on every push.

### Addresses that must stay undeliverable

`bounced-handler@`, `complained-handler@` and `suppressed-handler@test.myk9.com` are deliberately
unreachable fixtures for the Resend webhook tests. They move to `@myk9t.invalid` (RFC 6761
guarantees `.invalid` never resolves) rather than to real mailboxes — pointing them at an inbox
that accepts mail would make those tests assert nothing.

## Traps

1. **`seed-demo.sql` grants roles by matching on email address** — every grant in section 10 is
   `WHERE lower(p.email) = '…'`. Rename the database without changing the seeds in the same change
   and the next reseed grants nobody anything: no error, just an empty permission set. The DB
   transaction and the seed edit must ship together.

2. **`auth.users.email` and `people.email` are separate columns.** Both must be updated, or the
   seed's email match silently stops finding the person.

3. **Renaming beats recreating.** Renaming preserves auth ids, so every `user_roles` grant,
   `people` link and seeded fixture id survives. Recreating means re-granting everything and
   re-establishing the judge-only invariant by hand.

## Phases

### Phase 1 — code and seeds (one PR)

- `supabase/seed-demo.sql` (80 refs) and `supabase/seed-isolated-e2e-accounts.sql` (46)
- `apps/myk9show/src/test/e2e/fixtures/test-users.ts`, `.../helpers/testUsers.ts`
- `apps/myk9show/scripts/setup-e2e-test-users.ts` (+ its helpers test)
- `apps/myk9show/src/test/e2e-helpers/resetE2ePasswords.ts` (+ test)
- Contract tests: `seedDemoOfficialsContract.test.ts`, `clubScopedFixtureContract.test.ts`
- `.github/workflows/nightly-e2e.yml`: drop the four `E2E_JUDGE_EMPTY_PASSWORD` forwards

Historical documents — audit reports, dated walk logs, QA findings (~250 refs) — are **not**
rewritten. They record what was true when written.

### Phase 2 — database (one transaction)

Rename 5, create 3, grant `exhibitor2`, delete 11. Run after Phase 1 merges, so a reseed at any
point finds seeds and database agreeing.

### Phase 3 — secrets (Richard)

Ten GitHub secrets plus `.env.local`. Exact list delivered with the PR. `E2E_JUDGE_EMPTY_PASSWORD`
can be deleted rather than updated.

### Phase 4 — testing

- `pnpm test` full suite, and the two DB contract tests specifically
- `pnpm typecheck`, `pnpm lint`
- Verify grants against the applied database, not the migration text —
  `select unnest(relacl)::text from pg_class …` and the per-account role query
- Sign in as each of the eight accounts
- Re-run the MYK9-228 packet send and confirm arrival in a real inbox — the acceptance criterion
  that has never been provable

## Acceptance

- Eight sign-in accounts, all on `myk9t.com`, all able to sign in
- Zero `@test.myk9.com` addresses in `auth.users`
- The judge-only and club-admin-only invariants still hold, asserted by the contract tests
- A packet send lands in a mailbox that can be opened
