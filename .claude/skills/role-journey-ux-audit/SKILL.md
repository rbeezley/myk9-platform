---
name: role-journey-ux-audit
description: Persona-driven, multi-viewport UX audit of a single role's end-to-end journey in myK9Show, with automatic regression diffing against the prior run and a stop-gated hand-off to opsx for remediation. Use when the user wants to "walk the <role> journey", "audit the exhibitor/secretary/judge/club-admin/admin experience", "check UX regressions for <role>", "usability walk as an elderly/novice user", or `/role-journey-ux-audit <role>`. Audit-only — never edits source; produces a dated report and, on approval, an OpenSpec remediation change. Distinct from qa-feature (which fixes bugs mid-walk and writes a Playwright spec) and audit-pages (which sweeps for console/network errors, not persona UX).
---

# Role Journey UX Audit

Drive the live app as a specific **persona** playing a specific **role**, walk that
role's whole journey across **mobile / desktop / tablet**, and produce one dated,
severity-ranked findings report. Automatically diff against the previous run for the
same role so regressions surface. On your explicit approval, promote the buildable
findings into an OpenSpec change via `opsx:propose`.

This skill is a **thin orchestrator**. It does not reinvent methodology, route lists,
or browser conventions — it composes three existing skills and owns only what's new
(persona, multi-viewport, regression diff, opsx hand-off).

## What this reuses (do not duplicate)

| Need | Source of truth — read/follow it, don't copy |
| --- | --- |
| Finding methodology, 6 passes, severity rubric | **`UX-Audit`** skill |
| Per-role route inventory (Exhibitor, Secretary, Judge, Club Admin, Admin, Public) | **`audit-pages`** skill, "Route Groups" |
| Browser-driving + classify-as-you-go discipline | **`qa-feature`** skill (but invert its "fix mid-walk" — see Rules) |
| Canonical sign-in accounts and the two-step flow | `apps/myk9show/src/test/e2e/helpers/testUsers.ts` |
| Intentional-design carve-outs | `docs/INTENT.md`, `// INTENT:` comments |

## Inputs

Establish before starting; ask once only if genuinely ambiguous:

- **Role** (required) — one of `exhibitor` / `secretary` / `judge` / `club-admin` / `admin` / `public`.
- **Persona** — default `elderly-novice` (see Persona Library). The persona is the lens
  for *every* judgment; stay in character and narrate friction the moment it happens.
- **Viewports** — default `mobile,desktop,tablet` in the pass structure below. A user may
  scope to fewer (e.g. `--viewports mobile`).
- **Regression** — **always on.** Before writing, read the most recent prior report for the
  same role and tag findings NEW / STILL-OPEN / RESOLVED. No flag needed.

## Persona Library

| Persona | Lens — what breaks them |
| --- | --- |
| `elderly-novice` (default) | Retired, no computer/smartphone skill. Unlabeled icons, jargon, small tap targets, hidden actions, no feedback after an action, surprising navigation, reading level too high. |
| `first-time-exhibitor` | Knows dogs, not software. Registration/entry jargon, unclear show/trial/class hierarchy, payment anxiety. |
| `power-secretary` | Fast and impatient. Extra clicks, missing bulk actions, buried deep-links, redundant confirmations. |

Extend this table when a new persona is requested; keep each row to a one-line "what breaks them."

## Credentials — canonical accounts only

The `*@myk9t.com` accounts have **no `auth.users` row and cannot sign in**. Always use the
env-backed `e2e-*@test.myk9.com` accounts. Passwords live in `.env.local` (all e2e accounts
share one secret); read them from there, never print them.

| Role | Account | testUsers.ts key / wrapper |
| --- | --- | --- |
| exhibitor | `e2e-exhibitor@test.myk9.com` (protected; seeded dogs Willow, Ranger, Juniper) | `DEMO_EXHIBITOR` / `signInAsExhibitor` |
| secretary | `e2e-secretary@test.myk9.com` | `SECRETARY` / `signInAsSecretary` |
| judge | `e2e-judge@test.myk9.com` | `JUDGE` / `signInAsJudge` |
| club-admin | `e2e-clubadmin@test.myk9.com` | `CLUB_ADMIN` |
| admin | `e2e-admin@test.myk9.com` | `SITE_ADMIN` / `signInAsAdmin` |
| public | none | walk guest routes signed out |

**Sign-in is a two-step `SmartSignInPage`** — a single-screen email+password fill will fail:

1. Fill `credential-input` (the "Email or show passcode" field) with the email.
2. Click Continue (`continue-button`).
3. Wait for `password-input` to render — it does **not** exist in the DOM until this transition.
4. Fill `password-input`, click `sign-in-button`, wait for the URL to leave `/sign-in`.

## Workflow

### Step 0 — Pre-flight

- Dev server on :5173. If down: `pnpm dev:show` and wait for it to bind.
- Ensure `docs/ux-audits/` exists (create it if this is the first audit).
- Read `UX-Audit` (methodology), the target role's route group in `audit-pages`, and any
  `docs/INTENT.md` guidance for this role. Findings that contradict an intentional choice are
  noise — mark them "intentional per INTENT.md," don't file them.

### Step 1 — Load the regression baseline

Find the most recent `docs/ux-audits/<role>-*.md`. Hold its findings in mind so that when you
re-encounter (or fail to re-encounter) each one, you can tag it. If none exists, this is a
baseline run — every finding is NEW.

### Step 2 — Walk, per viewport, in this order (one session)

1. **Mobile (~390×844, touch)** — the full primary walk. Every path in the role's route group,
   every getting-lost probe. Simulate touch, not mouse.
2. **Desktop (~1280×800, mouse + keyboard)** — second full walk, faster. Focus on what *differs*:
   hover-only affordances (flag any action discoverable *only* on hover), wide-layout control
   scatter, keyboard/focus behavior, findings that got better/worse vs mobile.
3. **Tablet (~834×1112, touch, portrait + a landscape spot-check)** — a **diff pass, not a
   re-walk.** Record only width-unique issues (reflow/breakpoint breakage). If a screen is
   identical to mobile or desktop, say "inherits mobile/desktop; no new issues" and move on.

For each screen/step, per the persona: (1) state the goal and expectation; (2) attempt it and
screenshot; (3) note anything confusing/stalling/misleading; (4) **verify the action actually
succeeded** — don't assume state changed. Include CRUD where the role has it (for exhibitor:
add + edit a dog, create + edit an entry). Also probe empty, loading, error, and cancel/abandon states.

### Step 3 — Classify as you go (borrowed from qa-feature, fix step INVERTED)

| Symptom | Class | Action |
| --- | --- | --- |
| Locator not found / your own misstep | Walk error | Adjust your navigation, keep going |
| Confusing label, hidden action, no feedback, poor state | **UX finding** | Record it; tag `buildable` or `cosmetic-only` |
| Silent 4xx/5xx, console error, wrong state after save | **App bug** | Record as a Blocker/High finding — do **not** fix source |
| Contradicts `INTENT.md` | Not a finding | Note as intentional |

### Step 4 — Write the report (the only deliverable of this run)

Path: `docs/ux-audits/<role>-<persona>-<YYYY-MM-DD>.md`, where the date is today from the
environment (`date +%F`) — never hardcoded. Contents:

- One-paragraph overall-experience summary, noting how it differs across the three viewports.
- **Regression line:** counts of NEW / STILL-OPEN / RESOLVED vs the baseline run (name the file).
- **Top 5 to fix first.**
- **Findings table** — one row per issue (list an issue once with all affected viewports; don't
  duplicate rows):

  `Severity (Blocker/High/Med/Low) | Reg (NEW/STILL-OPEN/RESOLVED) | Tag (buildable/cosmetic-only) | Viewport(s) | Path & screen | What confused <persona> | Why it's a problem | Concrete fix`

- A short **"responsive / cross-breakpoint"** subsection for width-transition-only issues.
- Findings ordered by severity. Prioritize issues that make the persona **abandon the task or
  make a costly mistake** over cosmetic nitpicks.

Follow `UX-Audit`'s severity definitions and, where useful, its 6-pass structure to organize the walk.

### Step 5 — STOP and report

Do **not** create an OpenSpec change, file Linear issues, or write a `docs/plan-*.md`.
Post to chat: the top 5 findings, the regression delta, and the report path. Wait for the user
to review and say "proceed."

### Step 6 — On "proceed": promote to opsx (next turn)

1. Run **`opsx:propose`** to create one OpenSpec change (id like `<role>-ux-remediation`) scoped
   to the **`buildable`-tagged** findings. The audit report is the exploration input, so you may
   go straight to propose. The change's `proposal` / `design` / `specs` / `tasks.md` are the
   remediation plan — **do not also write a `docs/plan-*.md`** (per CLAUDE.md OpenSpec carve-out).
   `tasks.md` **must** include a testing phase (unit tests for extracted logic + a manual re-walk).
   Note in the change which findings were deliberately excluded (cosmetic-only) and why.
2. Create **one** pointer Linear issue (team **MyK9-platform**) linking to the change — e.g.
   `<Role> UX remediation — tracked in openspec change \`<role>-ux-remediation\``.
   Do not re-list individual findings; `tasks.md` is the execution tracker.
3. Tell the user the change id and that they can implement it with `opsx:ship <id>` (full pipeline)
   or `opsx:apply <id>` (work tasks with checkpoints).

## Regression, run over run

Because reports share the stable path scheme `docs/ux-audits/<role>-<persona>-<date>.md` and a
fixed column set, successive runs are mechanically comparable. A finding that reappears is
STILL-OPEN; one that's gone is RESOLVED (confirm it's actually fixed, not just unreached);
a brand-new one is NEW. The regression line at the top of each report is the at-a-glance signal.

## Rules

- **Audit-only. Never edit source, never fix a bug mid-walk.** This is the deliberate inversion of
  `qa-feature`. App bugs are recorded as high-severity findings and flow into the opsx change.
- **Never print or commit credentials.** Read the shared secret from `.env.local`.
- **Don't wander.** If you spot an issue outside this role's journey, use
  `mcp__ccd_session__spawn_task` to flag it; don't chase it.
- **Respect INTENT.** A behavior with an `// INTENT:` comment or `docs/INTENT.md` entry is not a
  finding unless the user approves changing it.
- **The stop-gate is mandatory.** Nothing lands in `openspec/` or Linear until the user
  reviews the report and says "proceed."
- **One change per audit, scoped to buildable findings.** Consolidate; do not spin up a spec per nitpick.

## When NOT to use

- Fixing a known bug end-to-end → `qa-feature`.
- Sweeping every route for console/network errors → `audit-pages`.
- A structural navigation/route problem specifically → `IA-Review`.
- Doc screenshots / user guides → `screenshot-docs`.
