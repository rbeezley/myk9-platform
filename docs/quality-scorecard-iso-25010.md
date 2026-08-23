# Quality Scorecard — ISO/IEC 25010:2023

> **Status:** Active

**Assessed:** 2026-08-23 · **Scope:** `apps/myk9show`, `apps/docs`, `packages/*`, `supabase/`
**Baseline:** ~3,547 non-test TS/TSX source files (~607k lines incl. generated types), 2,052 test files, 499 SQL migrations, 14 shared packages.

## What this is

A self-assessment against the nine product-quality characteristics of ISO/IEC 25010:2023, scored from
evidence that already exists in this repository — CI gates, coverage floors, the code-quality ratchet,
the QA findings registry, launch gate reviews, and the technical-debt register.

**Relationship to [`qa/quality-scorecard.md`](qa/quality-scorecard.md):** that file is an _operational_ trend
line — nightly pass rate, open-finding counts, a single 0–100 score updated after QA runs. This file is a
_product-quality-model_ assessment: what the platform is and is not measured on, characteristic by
characteristic. They do not overlap and neither replaces the other.

> **Drift flagged during this assessment.** `qa/quality-scorecard.md` was last updated **2026-05-15** and its
> snapshot records "Open blocker/high findings: **0**". As of today `docs/qa/findings.md` carries
> `QA-INFRA-OCC-STORM-037` **open at blocker** and `SA-2026-08-01-01` **blocked at high**. Under that file's
> own scoring formula the score would be 60, not 100. It needs a refresh.

**What it is not:** a certification, and not a claim about production behaviour. The platform is
pre-launch with no real users, so several sub-characteristics have no obtainable evidence. Those are
marked **Unmeasured** rather than given a guessed score. An unmeasured cell is a finding, not a blank.

## Scoring key

| Rating         | Meaning                                                               |
| -------------- | --------------------------------------------------------------------- |
| **Strong**     | Enforced automatically, on every change, with evidence retained.      |
| **Adequate**   | Covered, but enforcement is partial, manual, or the floor is set low. |
| **Weak**       | Known gap with named evidence; a regression here would likely ship.   |
| **Unmeasured** | No evidence exists either way. Not a pass and not a fail.             |

**Confidence** reflects how much the rating rests on automated evidence versus judgement.

## Summary

| #   | Characteristic         | Rating     | Confidence | One-line basis                                                                                 |
| --- | ---------------------- | ---------- | ---------- | ---------------------------------------------------------------------------------------------- |
| 1   | Functional suitability | Adequate   | Medium     | 2,052 test files and mutation testing on money paths, against ~35% whole-app line coverage     |
| 2   | Performance efficiency | **Weak**   | Medium     | Bundle budget enforced; an open **blocker** finding on DB contention; load rehearsal never run |
| 3   | Compatibility          | **Weak**   | High       | Five browser/device projects defined, **only chromium ever executed** in CI or nightly         |
| 4   | Interaction capability | Adequate   | Medium     | axe gate on serious/critical, but `color-contrast` excluded and scope is landing pages only    |
| 5   | Reliability            | Adequate   | Low        | Offline-first replication is a real strength; no backup/DR gate anywhere; telemetry is thin    |
| 6   | Security               | **Strong** | High       | Deepest-instrumented area by far; two holes — RBAC coverage floor at 3%, dependency gate red   |
| 7   | Maintainability        | **Weak**   | High       | 170 files break the project's own 500-line rule; complexity ceiling set at 30                  |
| 8   | Flexibility            | Adequate   | Low        | Clean package boundaries; scalability entirely unproven                                        |
| 9   | Safety                 | Unmeasured | —          | Real operational-constraint controls exist but have never been framed or reviewed as safety    |

---

## 1. Functional suitability

**Rating: Adequate — Medium confidence**

| Sub-characteristic         | Evidence                                                                                                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional completeness    | No requirements baseline to measure against. `docs/feature-audit-2026.md` is the closest artifact. **Unmeasured.**                                                                                                                                                                     |
| Functional correctness     | 2,052 test files; CI runs the app suite in 3 shards under `--sequence.shuffle` with coverage; `pnpm test:mutation` covers 4 targets — cart, score-validator, placement, replication-conflict; 499 migrations exercised by behavioral RLS/RPC SQL tests against a clean local Postgres. |
| Functional appropriateness | Governed by `docs/INTENT.md` and role-journey UX audits. Human-judged, not automated.                                                                                                                                                                                                  |

**Strengths.** Mutation testing on the money and scoring paths is unusually rigorous for a project this
size — it measures whether the tests would actually _catch_ a defect, which coverage alone never does.
Payment-path coverage floors are held at 80% statements / 85% branches / 95% functions.

**Gaps.**

- Whole-app coverage floors sit at **33% statements / 24% branches / 29% functions / 35% lines**. The
  floors are deliberately set just below measured coverage, so this approximates the real figure. High-stakes
  directories are carved out and held much higher, which is the right shape — but two thirds of the
  application is outside any meaningful correctness floor.
- Correctness is measured; _completeness_ is not measured at all. Nothing maps shipped behaviour back
  to a requirements set.

---

## 2. Performance efficiency

**Rating: Weak — Medium confidence**

| Sub-characteristic   | Evidence                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time behaviour       | `QA-INFRA-OCC-STORM-037` is **open at blocker severity** — `ringside_update_entry` 40001 conflict storms drove staging past 80% CPU.                                      |
| Resource utilisation | `pnpm --filter @myk9/show analyze:size` enforces an initial-load payload budget, ratcheting **down only**, in the CI build job. This is the one genuine performance gate. |
| Capacity             | `.github/workflows/load-rehearsal.yml` exists and its harness is green, but the run is `workflow_dispatch` and **has never been executed**. Capacity is unknown.          |

**Gaps.**

- The open blocker is the highest-severity unresolved finding in the registry and it is a
  performance-under-contention defect — precisely the class a pre-launch project cannot discover from
  synthetic use.
- ~30 `expect(duration).toBeLessThan(...)` assertions survive across 7 test files, but they largely assert
  200ms budgets against **mocked** DB calls. They measure the test machine, not the product. `TECHNICAL_DEBT.md`
  correctly flags these as a watch-item rather than evidence.
- No production RUM, no Core Web Vitals tracking, no query-latency budget.

**This is the characteristic where the gap between "we have QA infrastructure" and "we know how the
system behaves under load" is widest.**

---

## 3. Compatibility

**Rating: Weak — High confidence**

| Sub-characteristic | Evidence                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Co-existence       | PWA with a prompt-mode update flow (`@myk9/pwa-update`); offline-first replication into IndexedDB.                    |
| Interoperability   | AKC/UKC/ASCA registry mappers; PDF AcroForm fill for organisation forms; calendar feed edge function; Stripe Connect. |

**The finding.** `apps/myk9show/playwright.config.ts` defines five projects — `chromium`, `firefox`,
`webkit`, `mobile-chrome` (Pixel 5), and `tablet`. Every automated runner installs **chromium only**:

```
ci.yml:512          playwright install --with-deps chromium
ci.yml:587          playwright install --with-deps chromium
nightly-health.yml  playwright install --with-deps chromium
nightly-e2e.yml     playwright install --with-deps chromium
load-rehearsal.yml  playwright install --with-deps chromium
```

Four of the five defined projects have never run in automation. For a product whose users are at outdoor
events on phones, **WebKit/iOS is the untested configuration most likely to matter** — and Safari is the
engine where IndexedDB, service-worker, and storage-eviction behaviour diverges most from Chromium. The
offline-first architecture rests on exactly those APIs.

This is the cheapest high-value fix on the board: adding `webkit` and `mobile-chrome` to one nightly job
is a config change, not an engineering project.

---

## 4. Interaction capability

**Rating: Adequate — Medium confidence**

| Sub-characteristic           | Evidence                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Accessibility                | `a11y-smoke.spec.ts` runs axe-core and fails on `serious`/`critical` impacts.    |
| Operability                  | 44×44px touch-target floor, test-pinned in components (`min-h-11`).              |
| User error protection        | Confirmation flows, capacity/entry-close server guards.                          |
| Learnability / UI aesthetics | `docs/INTENT.md`, `DESIGN.md`, role-journey UX audits, IA reviews. Human-judged. |

**Strengths.** A blocking a11y gate at all puts this ahead of most projects, and the elderly-novice
persona in the UX audit skill is a genuine design constraint rather than a checkbox.

**Gaps.**

- The axe gate covers **public landing pages plus a handful of authenticated role landings** — not the
  secretary workbench, entry management, or ringside scoring, which is where the actual work happens.
- `color-contrast` is **excluded** from the gate, tracked pending a theme-token fix. Contrast is the most
  common real-world accessibility failure, so the exclusion removes the highest-yield rule.
- Four `QA-MOBILE-LAYOUT-BREAK-0{28,29,30,31}` findings remain open in the registry.
- `CUX-2026-08-02-01` open at medium severity.

---

## 5. Reliability

**Rating: Adequate — Low confidence**

| Sub-characteristic | Evidence                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Faultlessness      | Sharded shuffled test suite; coverage ratchet vs `main`; `--sequence.shuffle` in CI catches cross-test state leaks.                       |
| Availability       | `/admin/health` board over `system_health_snapshots`; 5-minute continuous cron plus a 03:00 ET full run.                                  |
| Fault tolerance    | Offline-first replication — the strongest reliability asset in the codebase. Show data lives in IndexedDB and survives connectivity loss. |
| Recoverability     | **No backup or disaster-recovery gate exists in any launch artifact.**                                                                    |

**Strengths.** Building for show-day connectivity loss is a real reliability investment, and the OCC/watermark
machinery in `@myk9/replication` is deliberate engineering rather than incidental.

**Gaps.**

- **Recoverability is entirely unaddressed as a gate.** `docs/launch-milestone-qa-checklist.md` covers eight
  areas — build, tests, static quality, money paths, DB/security, perf/a11y, dependencies, observability —
  and none of them is backup, restore, or DR rehearsal. Nothing in the repository demonstrates that a
  restore has ever been performed.
- **MYK9-200**: permissions do not replicate. A cold offline boot settles at `userRoles: []`, so every gated
  route renders its fallback — the user is authenticated but authorised for nothing, with the whole show
  sitting in IndexedDB beneath them. The warm path is correct, which is why no existing test sees it.
- Observability is thinner than it looks: Sentry is live, but `frontend_logs`, `activity_log`, and
  `analytics_events` **have no writers**. Availability is measured by a health board that carries
  non-continuous verdicts forward for up to 24 hours.
- Several `QA-TEST-FLAKE-*` findings are open. Flake erodes the faultlessness signal itself.

---

## 6. Security

**Rating: Strong — High confidence**

| Sub-characteristic            | Evidence                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confidentiality               | RLS on every table; column-level ACL allowlists; anon grant contract tests that **replay all 499 migrations** to fold effective grants; PostgREST embed-grant discipline. |
| Integrity                     | `pnpm qa:rls-smoke` (recursion); `qa:db-drift:enum`; `qa:db-drift:functions` (deployed vs repo reconciliation); Supabase advisors sweep.                                  |
| Accountability / authenticity | Edge functions handle auth internally with fail-closed secret couplings; Vault-backed cron secrets.                                                                       |
| Resistance                    | `pnpm audit --audit-level=high` monthly via `dependency-audit.yml`; go-live phase scripts 1–4. **Currently failing** — see below.                                         |

**This is the best-instrumented characteristic in the project by a wide margin**, and unusually so — the
migration-replay grant contracts and applied-ACL audits are a level of rigour most teams never reach.
The `CLAUDE.md` LESSONS file is effectively a hard-won threat model for this specific stack.

**Gaps.**

- **`src/services/rbac/**` coverage floors are set at 3% statements / 6% branches / 4% functions / 2% lines.**
  RBAC is the authorisation layer, is explicitly named in the config comment as one of the four highest-stakes
  directories, and yet carries floors two orders of magnitude below the payment path's. The floors were set
  just below measured coverage, so this reflects reality, not caution. **This is the single most surprising
  finding in the scorecard** — the most heavily-audited characteristic contains the least-tested critical
  directory.
- `SA-2026-08-01-01` is **blocked at high severity**.
- No CISQ/CWE static scanner runs over the TypeScript. Everything above is database-layer; application-layer
  injection, unsafe deserialisation, and secret-handling weaknesses are caught by review, not tooling.
- No penetration test or external review.
- **The dependency gate is red right now.** `pnpm audit --audit-level=high` exits **1** with 6 high and 1
  moderate advisory (measured 2026-08-23): five `brace-expansion` ReDoS advisories plus `fast-uri`, all
  transitive through `@vercel/node`, `eslint`, and `vite-plugin-pwa`. Real exploitability is low — these are
  build-time paths, not request-handling code — but the gate is failing, and `dependency-audit.yml` runs on
  `cron: '0 9 1 * *'` and is **not a PR check**, so up to a month can pass before anyone sees it. GitHub
  Dependabot reports the same 6 on the default branch.

  Note for anyone re-measuring: `pnpm audit | tail` reports **0**, because the pipe returns `tail`'s status.
  Redirect and read `$?` — this is the trap already recorded in `CLAUDE.md` LESSONS.

---

## 7. Maintainability

**Rating: Weak — High confidence**

| Sub-characteristic         | Evidence                                             | Value   |
| -------------------------- | ---------------------------------------------------- | ------- |
| Modularity                 | Files exceeding the project's own 500-line rule      | **170** |
| Analysability              | `as any` casts                                       | 24      |
| Modifiability              | TODO/FIXME/HACK markers                              | 19      |
| Modularity (architectural) | Direct Supabase core-flow bypasses                   | 3       |
| Testability                | Mutation testing on 4 targets; custom render harness | —       |
| Reusability                | 14 shared packages; ADRs under `docs/adr/`           | —       |

**Strengths.** The ratchet (`pnpm qa:code-quality-ratchet`) is a genuinely good instrument — it makes debt
visible and blocks regression on every PR. ADRs exist, docs carry an anti-rot convention with a staleness
check in CI, and `CLAUDE.md` captures institutional knowledge that would otherwise be lost.

**Gaps.**

- **170 files break the 500-line rule** the project set for itself, essentially flat against the 175 recorded
  in July 2026. The ratchet prevents growth; it does not reduce the number. `DEBT-002` is marked COMPLETE in
  the register while the ratchet counts 170 violations — the register is a Feb-2026 snapshot and says so, but
  the two artifacts read as contradictory.
- **ESLint `complexity` is capped at 30 and `max-depth` at 8.** The CISQ/Sonar convention is 10–15 and 3–4.
  A green lint run currently permits functions two to three times more complex than the industry threshold,
  so "lint passes" carries much less maintainability signal than it appears to. `DEBT-009` (466 complex
  functions) and `DEBT-010` (971 deep-nesting instances) were the original basis for these thresholds and
  remain open.
- CI gates on lint **errors only** — warnings, including `no-console` and `react-refresh`, do not block.

---

## 8. Flexibility

**Rating: Adequate — Low confidence**

| Sub-characteristic | Evidence                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Adaptability       | Multi-registry sport layer (AKC/UKC/ASCA) with documented extension procedure.             |
| Installability     | PWA install path; Vercel auto-deploy from `main`; staging and production deploy workflows. |
| Replaceability     | 14 packages behind explicit exports; ADR-recorded library decisions (Base UI over Radix).  |
| Scalability        | **Unmeasured** — see §2. No load rehearsal has ever run.                                   |

The registry-mapper layer is real evidence of adaptability: a new sanctioning body has a documented,
repeatable path. Scalability drags the rating down and cannot be raised without executing the load rehearsal.

---

## 9. Safety

**Rating: Unmeasured**

New in the 2023 revision and never considered for this platform. That is a defensible default — this is
event-management software, not a medical device — but the characteristic is not vacuous here, and some of
its controls already exist without being recognised as safety controls:

| Sub-characteristic     | Existing control                                                                |
| ---------------------- | ------------------------------------------------------------------------------- |
| Operational constraint | Entry-close server guard; judge-day capacity model; entry capacity enforcement. |
| Fail-safe              | Offline scoring queue; replication OCC conflict handling.                       |
| Hazard warning         | Ring-alert SMS opt-in (currently behind a kill switch).                         |
| Risk identification    | None.                                                                           |
| Safe integration       | None.                                                                           |

**Recommendation: assess once, then close.** Write a short statement of which 25010 safety sub-characteristics
apply to a dog-show platform and which are out of scope, so the gap is a recorded decision rather than an
oversight. The honest answer is probably "operational constraint and fail-safe apply; the rest do not."

---

## Cross-cutting observations

**1. The instrumentation is inverted relative to the risk.** Security and money paths — the areas that would
attract the most scrutiny — are the best-tested. The areas that will actually determine whether launch day goes
well — capacity under load, iOS/WebKit behaviour, recoverability, RBAC — are the least-tested. This is the
natural result of building gates in response to defects found, and it is worth correcting deliberately.

**2. Several artifacts read as more complete than the live state.** `TECHNICAL_DEBT.md` shows "0 open" for a
Feb-2026 sweep while the ratchet counts 170 oversized files; `DEFERRED-WORK.md` reads "ALL SECTIONS COMPLETE"
for its own snapshot. Both files carry explicit scope notes saying so, which is good practice — but anyone
skimming gets a rosier picture than the measurements support.

**3. Three characteristics carry no automated evidence at all:** functional completeness, recoverability, and
safety. Two of the three are addressable cheaply.

## Recommended next measurements

Ordered by value per unit of effort:

| #   | Action                                                                                     | Addresses        | Effort        |
| --- | ------------------------------------------------------------------------------------------ | ---------------- | ------------- |
| 1   | Add `webkit` + `mobile-chrome` to one nightly Playwright job                               | §3 Compatibility | Config change |
| 2   | Raise the RBAC coverage floors and write tests to meet them                                | §6 Security      | Days          |
| 3   | Perform one documented restore from backup; add it as a launch gate                        | §5 Reliability   | Hours         |
| 4   | Execute the load rehearsal (`workflow_dispatch`, owner-gated)                              | §2, §8           | One run       |
| 5   | Land the theme-token fix and re-enable `color-contrast` in the axe gate                    | §4               | Days          |
| 6   | Extend the axe gate past landing pages to the workbench and ringside                       | §4               | Days          |
| 7   | Lower ESLint `complexity` toward 15 and `max-depth` toward 4; ratchet the fallout          | §7               | Weeks         |
| 8   | Fix MYK9-200 (permissions must survive a cold offline boot)                                | §5               | Days          |
| 9   | Write the one-page safety applicability statement                                          | §9               | Hours         |
| 10  | Add a CISQ-aligned static scan (SonarCloud — free for public repos)                        | §6, §7           | Half a day    |
| 11  | Clear the 7 open `pnpm audit` advisories and make the audit a PR check, not a monthly cron | §6 Security      | Hours         |

**On item 10:** a CISQ scan reads TypeScript and will not meaningfully read the 499 migrations, the RLS
policies, or the column ACLs — which is where this project's expensive defects have historically originated.
It would fill in §6 and §7 with real numbers, but a clean security score from it would be a confident
statement about the safe part of the system. Read it as a maintainability instrument first.

## Re-assessment

Re-run at the next launch-gate review, or when items 1–4 land. The scorecard is only useful if the
**Unmeasured** cells shrink over time.
