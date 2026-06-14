# Phase 1 UX Audit Summary: Exhibitor Core Journey

**Date:** 2026-04-04
**Pages audited:** Show Details, Registration Wizard, Exhibitor Dashboard, My Entries, Show Day, Dog Detail

---

## Cross-Cutting Themes

### 1. Error States Disguised as Empty States

My Entries (5.3), Show Details MyEntriesTab (3.4), and Show Day (5.3) all swallow fetch errors and show "no data" instead of an error with retry. On show day with flaky venue Wi-Fi, this causes exhibitor panic ("Where are my entries?!").

### 2. Dead Tap Targets / Unwired Navigation

Show Day NextUpCard and ClassTimelineCard have `onNavigate` that is never wired (5.3/3.3-3.4). Dog Detail's "Add Achievement" dialog is rendered but unreachable (3.7). "Add Past Result" is a no-op (3.6). These are interactive elements that silently do nothing.

### 3. Missing Smart Defaults

Show Details defaults to Overview tab even when user has entries (4.1). Dog Detail defaults to Registrations instead of Competitions/Title Progress (2.2). Registration Wizard collapses all trials except the first (IA 2.2). Recent Results on Dashboard is collapsed by default (2.1).

### 4. INTENT.md "Title Progress" Gap

Dashboard has zero title tracking (1.1). Dog Detail buries titles under a non-default premium tab (2.2). Hero card shows breed/status but not earned title abbreviations (1.3). The INTENT promise of "title progress -- no hunting" is not delivered anywhere in the exhibitor journey.

### 5. Decorative Animations Violating INTENT

Registration Wizard has `animate-pulse` glow on Next button and step indicator. INTENT.md explicitly says "no animations for the sake of animations."

---

## Top 10 Findings by Severity

| Rank | Finding                                                                 | Page                | Severity | Effort                                                  |
| ---- | ----------------------------------------------------------------------- | ------------------- | -------- | ------------------------------------------------------- |
| 1    | Mock credit card form collects fake data, never submits to Stripe       | Registration Wizard | Critical | Medium — replace with placeholder or Stripe Elements    |
| 2    | Zero loading feedback during payment-to-confirmation (5+ async ops)     | Registration Wizard | Critical | Low — wire `isLoading` prop already on WizardNavigation |
| 3    | `UpcomingShowsSection` injects mock competitions when store is empty    | Dog Detail          | Critical | Low — remove mock data injection                        |
| 4    | Error states show as empty lists (My Entries, Show Details, Show Day)   | Cross-cutting       | High     | Low — add error state with retry to 3 hooks             |
| 5    | Show Day `onNavigate` not wired — dead tap targets on cards             | Show Day            | High     | Low — one-line fix to pass navigate callback            |
| 6    | "Add Achievement" dialog unreachable, "Add Past Result" is no-op        | Dog Detail          | High     | Low — wire button handlers                              |
| 7    | No entry status badge in Show Details hero (open/closed/closing soon)   | Show Details        | High     | Low — render existing `EntryStatusInfo` label           |
| 8    | Register button silently disappears when entries close (no explanation) | Show Details        | High     | Low — show "Entries Closed" message                     |
| 9    | Title progress absent from Dashboard, buried on Dog Detail              | Cross-cutting       | High     | Medium — add title summary card                         |
| 10   | 62% of Dog Detail tabs are premium-gated (feels like bait)              | Dog Detail          | High     | Medium — design decision on free-tier experience        |

---

## Quick Wins (high impact, low effort)

| Fix                                                                | Page                | Time Est |
| ------------------------------------------------------------------ | ------------------- | -------- |
| Wire `isLoading` to WizardNavigation during payment submission     | Registration Wizard | 5 min    |
| Wire `onNavigate` to Show Day cards                                | Show Day            | 5 min    |
| Render `EntryStatusInfo.label` as badge in Show Details hero       | Show Details        | 10 min   |
| Show "Entries Closed" message when register button is hidden       | Show Details        | 10 min   |
| Change `defaultOpen={false}` to `true` on Dashboard Recent Results | Dashboard           | 1 min    |
| Expand all trials by default in ClassSelectionStep                 | Registration Wizard | 5 min    |
| Remove mock data injection in UpcomingShowsSection                 | Dog Detail          | 10 min   |
| Add error state with retry to My Entries data hook                 | My Entries          | 20 min   |
| Reverse sort order on My Entries (upcoming first)                  | My Entries          | 5 min    |
| Remove `animate-pulse` glow effects from Registration Wizard       | Registration Wizard | 5 min    |

---

## What's Working Well

- **Show Day architecture** — NextUpCard hierarchy (next up, later today, completed) perfectly maps exhibitor mental model
- **Smart entry defaults** — Registration auto-selects exhibitor's dogs, auto-assigns handlers, remembers view preferences
- **Touch targets** — Consistently 44-48px across all pages, INTENT.md compliant
- **Focus-visible rings** — Keyboard accessibility is solid throughout
- **Progressive disclosure** — Show Day collapses non-essential sections, ClassesTab "Mine" toggle defaults based on entries
- **Notification system** — Sound throttling, TTS cancellation, toast stacking prevent alert overload on show day

---

## Recommendations

1. **Fix the 3 criticals first** — mock card form, missing loading state, mock data injection. All are trust-breaking.
2. **Batch the error state fixes** — same pattern needed in My Entries, Show Details, and Show Day. Create a shared `useQueryWithErrorState` wrapper or add error handling to the 3 specific hooks.
3. **Wire dead tap targets** — Show Day `onNavigate` and Dog Detail `addDialogOpen` are 5-minute fixes with outsized impact.
4. **Address the title progress gap** — This is the biggest INTENT.md miss. Add a title summary to the Dashboard and promote title abbreviations to the Dog Detail hero.
5. **Revisit premium gating on Dog Detail** — 62% locked tabs damages the free-tier experience. Consider showing read-only previews or reducing gated tabs to 2-3.

---

## Next Steps

- Add Critical and High findings to TO-DOS.md
- Proceed to Phase 2 (Secretary Operations) or fix Phase 1 findings first
