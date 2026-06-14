# Secretary Launch Readiness Audit

**Date:** 2026-05-26  
**Auditor:** Codex  
**Scope:** Initial secretary golden-path readiness walk  
**Sources:** Local myK9Show dev server at `http://localhost:5173`, seeded secretary account, `docs/INTENT.md`, `docs/goals/fall-2026-launch-readiness-scorecard.md`, Playwright snapshots, console logs, network logs, and screenshots.

## Audit Context

This was the first scorecard-driven audit pass for the fall 2026 launch-readiness goal. It focused on the highest-priority role: secretary/show-day reliability.

The walk used the seeded secretary account documented in `docs/testing/secretary-walk-seed.md` and the seeded Headline show:

- Show: `Headline`
- Show ID: `18802fc0-1558-4dc3-902d-989edef4df3c`
- Routes visited:
  - `/sign-in`
  - `/secretary/dashboard`
  - `/secretary/shows/18802fc0-1558-4dc3-902d-989edef4df3c?phase=show-desk`
  - `/secretary/reports`
  - `/secretary/entries/18802fc0-1558-4dc3-902d-989edef4df3c`

Artifacts:

- `docs/goals/audits/artifacts/2026-05-26-secretary/01-dashboard.png`
- `docs/goals/audits/artifacts/2026-05-26-secretary/02-show-desk-headline.png`
- `docs/goals/audits/artifacts/2026-05-26-secretary/03-next-action-reports-target.png`
- `docs/goals/audits/artifacts/2026-05-26-secretary/04-entry-management-zero-after-500.png`

## Readiness Status

| Scorecard Dimension | Status | Reason |
| --- | --- | --- |
| Secretary golden path | Red | Entry Management shows `0` entries for a show that dashboard/workbench report as having 79 pending entries. |
| Show-day reliability | Red | Show Desk recommends a wrap-up/judge-signature action before the show has started and routes to a generic report page. |
| Data correctness | Red | Multiple surfaces disagree on the same show's entry counts and entry availability. |
| UX clarity | Yellow | Show Desk has strong guidance structure, but current guidance is misleading for the tested fixture. |
| Reports and official forms | Yellow | Reports page renders check-in sheets, but this pass did not verify print output or official closeout forms. |
| Test and CI health | Unknown | This audit did not run test suites; it captured browser evidence only. |

## Pass 1: Mental Model Alignment

**What UI suggests:** A secretary can open the dashboard, pick the active show, follow "Next best action", and review pending entries.

**What it actually does:** The dashboard and workbench identify pending entry-review work, but the dedicated Entry Management route fails to load those entries and renders an empty/zero state. The Show Desk also recommends "Collect judge signature" even though the show status says setup, `0 of 40 classes complete`, and the show dates are in the future.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Dashboard attention links | Pending-entry counts lead to a reviewable list | Entry Management later shows `0` entries after a 500 from the entries query | High |
| Show Desk "Next best action" | The top recommendation is the next real show-day task | Recommends judge sign-off while no classes are complete | High |
| Show Desk "Start" for judge signature | Opens the exact sign-off workflow or completed class needing signature | Navigates to generic Reports with `check-in-sheet` selected | High |
| Today date scope | Today should reflect current show-day work | Future June trials appear under the selected Today scope during a May audit | Medium |

**Jargon found:** None severe in this pass. "Show Desk" and "Next best action" match the current product framing.

## Pass 2: Information Architecture

**Current structure:**

- Dashboard: cross-show greeting, Needs attention list, show buckets, personal tasks.
- Show Desk: tools panel, show status, pending signals, next best action, up-next queue, show map, closeout.
- Entry Management: show selector, stats, filters, entry tabs.
- Reports: show/report/trial/class/sort selectors plus report iframe preview.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Attention source divergence | Dashboard, Show Desk, Entry Management | Dashboard and Show Desk claim pending entries exist; Entry Management renders zero entries | Treat as a P1 data/load bug before evaluating lower-level IA polish |
| Wrong task promoted | Show Desk | Wrap-up work appears as the primary recommendation during setup/not-started state | Gate wrap-up recommendations behind completed-class evidence and current phase/date |
| Generic report destination | Next best action -> Reports | A specific judge-signature action lands on a generic report picker | Deep-link to the exact report/signature workflow or keep the action disabled with a reason |

**Visibility problems:**

- Hidden but should be visible: Entry load failure. The UI shows zero entries instead of a clear failure/retry state.
- Prominent but should be secondary: Closeout section appears in Show Desk even while the selected show has no completed classes in the visible status.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Needs attention rows | Links to concrete work | Route to Entry Management or public show page | Mostly |
| Next best action Start | Primary action | Navigates to Reports page | No |
| Manage entries button | Direct entry-review task | Could not verify because Entry Management load fails | Partial |
| Sidebar hover overlay | Invisible dismiss layer | Can intercept first content click while sidebar is hover-expanded | Partial |

**False affordances:** The "Start" button implies task execution, but the observed destination is a generic report selector.

**Hidden affordances:** The desktop sidebar hover overlay is invisible. Moving the cursor away from the sidebar removes it, but while active it can intercept clicks on main content.

**Recommended fixes:**

- Make Next Best Action destinations specific enough that "Start" lands on the matching task.
- Add visible error/retry state for Entry Management query failures.
- Consider making the desktop sidebar dismiss overlay `pointer-events: none` outside the sidebar, or ensure first content click is not swallowed silently.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Dashboard | Choose from 9 attention rows across several shows | Yes: preserve list, but promote the single selected/current show path when there is one active show |
| Show Desk | Choose between Tools, pending signals, next action, Up next, Show Map, Closeout | Yes: fix recommendation ranking first; current layout is only helpful if top guidance is trustworthy |
| Entry Management | Interpret zero entries despite prior "79 pending" counts | Yes: show explicit load failure and retain prior context |

**Missing defaults:**

- Reports page reached from a judge-signature action should default to the relevant signature/report target, not `check-in-sheet`.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Closeout content on not-started show | Secretary only after classes complete | Hide or demote until class completion/wrap-up criteria are met |
| Dashboard cross-show attention volume | Secretaries managing multiple shows | Keep, but make the active/current show path obvious |

**Cognitive load score:** High until data loading and recommendation correctness are fixed. The structure is promising, but the secretary cannot trust the guidance in the observed state.

## Pass 5: State Coverage

### Secretary Dashboard

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Loading | Yes | Not evaluated | Dashboard eventually rendered |
| Success | Yes | Mixed | Attention rows render, but downstream route fails |
| Error | Partial | Poor | Background people query 500 logs to console without user-facing recovery |

### Show Desk

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Success | Yes | Mixed | Guidance UI exists but recommends wrong phase/action |
| Partial | Yes | Poor | Shows setup/not-started state alongside wrap-up recommendation |
| Error | Not observed | Unknown | Not evaluated |

### Entry Management

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Loading | Yes | Unknown | Initial spinner observed briefly |
| Success | No for tested show | Poor | Expected entries did not load |
| Empty | Yes | Misleading | Shows `0` entries after a failed entries query |
| Error | No | Missing | Console logs 500; UI does not tell the secretary loading failed |

**Dead ends found:** Entry Management becomes a false empty state. The secretary has no visible explanation or recovery path.

**Missing error handling:** The entries query and people query both fail with Supabase 500s; Entry Management does not surface a user-facing error.

## Pass 6: Flow Integrity

**Primary flow tested:** Sign in as secretary -> open dashboard -> enter active show workbench -> follow next best action -> inspect entry review surface.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Sign in as seeded secretary | Successful | None |
| 2 | Review dashboard attention | Successful, but many cross-show signals compete | Medium |
| 3 | Open Day of Show / Show Desk | Successful | None |
| 4 | Interpret Show Desk status | Conflicting: Setup/not-started status plus wrap-up/judge-signature recommendation | High |
| 5 | Click Next Best Action Start | Lands on generic Reports/check-in-sheet view, not a signature workflow | High |
| 6 | Open Entry Management for same show | Page renders `0` entries after entries query 500, despite prior 79 pending count | Critical |

**Abandonment risks:**

- Secretary may believe a show has no entries to review because Entry Management silently falls back to zero.
- Secretary may stop trusting the "Next best action" system if it promotes impossible or irrelevant work.
- Secretary may not know whether the app, their permissions, or the data is wrong because errors are hidden.

**Recovery gaps:**

- Missing retry/error state on Entry Management load failure.
- No visible explanation for conflicting entry counts.
- No deep link from a specific next action to the exact task state.

**Flow verdict:** Broken for entry-review readiness. The secretary cannot complete the pending-entry review path from the observed state.

---

## Summary

**Overall UX health:** Critical Issues

### Critical (Fix Immediately)

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Entry Management shows zero entries after a failed entries query for a show that other surfaces report as having 79 pending entries | 1, 5, 6 | Blocks secretary entry review and can mislead users into thinking there is no work | Medium |

### High Priority (Fix Soon)

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Show Desk promotes "Collect judge signature" while no classes are complete and the show is not currently running | 1, 2, 4, 6 | Undermines trust in next-action guidance | Medium |
| Next Best Action "Start" lands on generic Reports/check-in-sheet instead of a specific signature workflow | 1, 2, 3, 6 | Turns guidance into a dead-end/guessing task | Medium |
| Repeated people query 500s appear on secretary pages without user-facing recovery | 5 | Creates background instability and likely contributes to broken downstream surfaces | Medium |

### Medium Priority (Plan For)

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Today scope shows future show dates during the current May audit | 1, 4 | Confuses what "today" means before the show starts | Low/Medium |
| Desktop sidebar hover overlay can intercept main-content clicks while expanded | 3 | First click can feel ignored | Low |

### Quick Wins

- Add a visible Entry Management error state when `loadEntries` fails instead of rendering zero.
- Gate wrap-up/judge-signature recommendations behind completed-class data.
- Include report/action params when routing from Next Best Action into Reports.

## Backlog Candidates

```md
- [ ] **[P1] Entry Management renders a false zero-entry state after entry query failure** — Readiness gap from `docs/goals/audits/2026-05-26-secretary-launch-readiness-audit.md`. Expected: Headline's pending entries are reviewable from Entry Management. Actual: `/secretary/entries/18802fc0-1558-4dc3-902d-989edef4df3c` logs a Supabase 500 for the entries query and renders `0` entries with no user-facing error. Evidence: `docs/goals/audits/artifacts/2026-05-26-secretary/04-entry-management-zero-after-500.png`.

- [ ] **[P1] Show Desk next-action ranking promotes wrap-up work before the show is ready** — Readiness gap from `docs/goals/audits/2026-05-26-secretary-launch-readiness-audit.md`. Expected: the primary recommendation reflects the next valid secretary action for the current show phase/date. Actual: Show Desk says `0 of 40 classes complete` but recommends `Collect judge signature`. Evidence: `docs/goals/audits/artifacts/2026-05-26-secretary/02-show-desk-headline.png`.

- [ ] **[P2] Next Best Action report routing is too generic** — Readiness gap from `docs/goals/audits/2026-05-26-secretary-launch-readiness-audit.md`. Expected: a specific signature/report action opens the exact relevant report or workflow. Actual: `Start` opens `/secretary/reports` with `check-in-sheet` selected. Evidence: `docs/goals/audits/artifacts/2026-05-26-secretary/03-next-action-reports-target.png`.
```

## Next Audit Steps

1. Reproduce the Entry Management 500 at the code/query level and determine whether it is a schema relationship issue, RLS issue, stale query field, or seed-data mismatch.
2. Continue the secretary golden path after Entry Management is fixed enough to review pending entries.
3. Add an offline/reconnect scoring pass once the online secretary review path is stable.
4. Run a dedicated Reports/forms print verification pass after routing and report-target issues are resolved.
