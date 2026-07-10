# Proposal: exhibitor-my-shows-elderly-ux-remediation

## Why

The 2026-07-09 Codex elderly-novice audit of `/exhibitor/entries` ("My Shows") found the page **Needs Work**: two apparently contradictory entry counts (9 "Current Entries" vs 13 "My Entries/All"), a screen-reader-only page title on phones, entry cards that push actions below a full phone screen of reference detail, several sub-44px touch targets, and a phone header with six+ unlabeled icon controls. All High/Medium findings were verified against the code. The audience is largely retired exhibitors with limited tech comfort; trust loss from inconsistent-looking numbers and unreachable actions directly undermines the Exhibitor intent ("this respects my time") and fall 2026 launch readiness — this is the page every exhibitor lands on.

## What Changes

Verified audit findings adopted (source: `docs/ux-audits/exhibitor-my-shows-elderly-ux-audit-2026-07-09.md`):

- **Count scope legibility** — label the summary "Current entries" scope and the entries section "All entries, including past" (or equivalent visible one-line scope note) so 9 and 13 can never both read as "my entries". The scope difference is already documented in a code comment (`CompactStatsRow.tsx:60-66`); make it user-visible.
- **Visible mobile page title** — replace the `sr-only` `<h1>My Shows</h1>` (`MyEntriesPage/index.tsx:323`) with a visible heading on phone (and keep correct heading order on desktop).
- **Entry-card progressive disclosure** — `MyEntryCard` leads with status, dog, show date, location, and the single next action (check-in, finish payment, or view show); collapse per-class detail, confirmation number, and post-submission close dates behind a "Show details" toggle. Close date stays prominent only while editing is still possible.
- **Touch targets ≥44px** — "Enter a Show" CTA (currently `size="sm"`/32px), directions link (~22px row), and sidebar close control.
- **Readability** — raise 14px muted supporting copy toward 16px and strengthen contrast in both dark and light mode (audit measured ~4.9:1; target AAA-leaning for primary reading text).
- **Metric-card affordance** — the four clickable summary cards get a persistent visible cue (chevron or "View" label); they currently read as static metrics.
- **Fees de-emphasis when paid** — when nothing is due, the fees tile becomes a quiet "Paid in full" success line linking to My Payments; a positive amount due keeps top priority (extends the existing shared amount-due derivation, no new computation).
- **Phone header simplification** — move theme toggle and AskQ assistant into the existing account dropdown on phone widths; keep search, notifications, cart (already conditional), and account visible. Consolidation of existing controls only — no new menu or page.
- **Filter strip legibility on phone** — keep filter labels readable (no truncation to illegibility); strengthen the horizontal-overflow edge cue on the tab strip and dog strip.
- **Filter-specific empty states** — replace the one-size "Browse All Shows" recovery with per-tab copy/actions (e.g. Waitlist-empty explains what waitlist means; Completed-empty points at Upcoming).
- **Error copy tone** — replace "Please check your connection" with offline-first, non-blaming stale-data phrasing consistent with the product principle that offline is normal.

Additions Codex missed:

- **File-size remediation** — `MyEntriesPage/index.tsx` is 711 lines (over the 500-line rule); extract the empty/error states and section scaffolding into sibling modules while touching the file.
- **Check-in as first-class next action** — the audit noted check-in "can be buried"; the progressive-disclosure design must surface an actionable check-in at the card summary level, not only inside expanded class rows.
- **Unit tests, assertion-first** — pure helpers for count-scope labels, next-action derivation, and per-tab empty-state content get vitest coverage before UI wiring; regression tests pin the visible scope-label strings.
- **Both color modes verified** — the audit ran dark-mode only; acceptance includes light-mode readability checks.

## Capabilities

### New Capabilities

- `exhibitor-my-shows-legibility`: elderly-novice legibility of the My Shows page — visible mobile title, entry-card progressive disclosure with a single surfaced next action, minimum 44px touch targets, readable supporting text, visible affordance on clickable metric cards, readable phone filter labels with overflow cues, per-filter empty-state recovery, offline-first error copy, simplified phone header (consolidation into existing account menu).

### Modified Capabilities

- `exhibitor-count-integrity`: strengthen the existing "differing scopes are labeled distinctly" requirement — the My Shows summary and entries-list section SHALL carry visible scope labels ("Current entries" vs "All entries, including past") rather than relying on distinct-but-unexplained labels.
- `exhibitor-money-clarity`: add a requirement that a $0-due state renders as secondary/quiet success ("Paid in full" linking to My Payments) rather than a prominent fee total, while positive amounts due keep visual priority and the existing pay path.

## Impact

- **Code:** `apps/myk9show/src/pages/MyEntriesPage/index.tsx` (+ extracted sibling modules), `modules/MyEntryCard.tsx`, `components/exhibitor/CompactStatsRow.tsx`, `components/common/PrimaryTabs.tsx`, `components/layout/AppHeader.tsx`, `useMyEntriesFilters.ts` / `myEntriesUtils.tsx` helpers, related tests. No database, replication, or edge-function changes; all data reads stay on existing paths.
- **Duplication check:** no new page, sheet, or dialog. Every change simplifies the existing My Shows page or deep-links to existing surfaces (My Payments, Show Details, `/shows`). Header change consolidates existing controls into the existing account dropdown.
- **INTENT guardrails:** preserves `// INTENT:` blocks in `index.tsx`, `CompactStatsRow.tsx`, `FirstRunZeroState.tsx`; changes are checked against `docs/INTENT.md` Exhibitor targets ("I know where to be", ≤2 taps to common actions, text readable without squinting).

## Non-Goals

- No redesign of the filter vocabulary (the audit's "Current / Needs attention / Past" suggestion) — the six existing filters stay; only their legibility improves. A vocabulary change is a separate product decision.
- No "what needs my attention" smart-priority engine; next-action surfacing is per-card derivation from existing status data.
- No changes to the entry wizard, `/shows` discovery, FirstRunZeroState, or the AskQ assistant itself.
- No new notification, badge, or dashboard surface of any kind.
