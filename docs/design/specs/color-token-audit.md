# CSS Color Token Audit

> Audited 2026-03-10. Research only — no code changes made.

## Existing Token System

The codebase has **two separate token systems** that are not fully integrated:

### A. Tailwind Semantic Tokens (`tailwind.config.js` + `index.css`)

- `primary` / `primary-foreground` — user-selectable accent (green/blue/orange/purple via CSS classes)
- `background`, `foreground`, `card`, `popover`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`
- `chart-1` through `chart-5`
- Status utilities: `success-green`, `warning-orange`, `error-red` (defined as CSS vars + manual utility classes)

### B. myK9Q Design Tokens (`pages/scoring/styles/design-tokens.css`)

- Status tokens: `--status-checked-in`, `--status-conflict`, `--status-pulled`, `--status-at-gate`, `--status-in-ring`, `--status-completed`, etc.
- Check-in tokens: `--checkin-none`, `--checkin-checked-in`, `--checkin-conflict`, `--checkin-pulled`, `--checkin-at-gate`, `--checkin-in-ring`
- Semantic tokens: `--token-success`, `--token-warning`, `--token-error`
- Result tokens: `--token-result-qualified`, `--token-result-nq`, `--token-result-excused`
- Payment tokens: `--pending-orange`, `--success-green`, `--error-red`

**Key gap:** The myK9Q design tokens exist as CSS variables but have **no corresponding Tailwind color mappings**. myK9Show components use raw Tailwind color classes instead.

---

## Hardcoded Color Usage

~1,100+ occurrences of hardcoded Tailwind color classes across 150+ files.

| Color       | Occurrences | Primary Use                           |
| ----------- | ----------- | ------------------------------------- |
| `emerald-*` | ~75         | Success, "active", "completed" states |
| `green-*`   | ~120        | Success, check-in, positive states    |
| `red-*`     | ~130        | Error, destructive, pulled, declined  |
| `blue-*`    | ~120        | Info, in-ring, links, checked-in      |
| `amber-*`   | ~35         | Warnings, conflicts                   |
| `yellow-*`  | ~50         | Warnings, pending, waitlist           |
| `orange-*`  | ~50         | Warnings, go-to-gate, energy          |
| `purple-*`  | ~35         | At-gate, premium, analytics           |
| `teal-*`    | ~30         | Brand/primary, timer UI               |
| `gray-*`    | ~100        | Neutral, disabled, muted              |
| `slate-*`   | ~60         | Neutral, sidebar, completed status    |

---

## Critical Inconsistencies

4 check-in statuses render different colors depending on which file defines them:

| Status       | `check-in-types.ts` | `CheckInStatusBadge.tsx` | `design-tokens.css` |
| ------------ | ------------------- | ------------------------ | ------------------- |
| `checked-in` | `blue-600`          | `emerald-500`            | `#14b8a6` (teal)    |
| `conflict`   | `red-600`           | `amber-500`              | `#f59e0b` (amber)   |
| `pulled`     | `gray-600`          | `red-500`                | `#ef4444` (red)     |
| `at-gate`    | `green-600`         | `purple-500`             | `#8b5cf6` (purple)  |

**"Success" green** also uses 3 different shades interchangeably: `emerald-500`, `green-500`, `teal-500`.

---

## High-Priority Files for Token Conversion

### Status Color Mappings (fix first — semantic meaning)

| File                                          | Issue                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `components/exhibitor/CheckInStatusBadge.tsx` | `STATUS_COLORS` uses raw `emerald/amber/red/purple/blue/slate`                      |
| `types/check-in-types.ts`                     | `CHECK_IN_STATUS_CONFIG` uses raw classes, **inconsistent with CheckInStatusBadge** |
| `features/pipeline/mission-control-types.ts`  | `CLASS_STAGE_META` uses raw `yellow/green/blue`                                     |
| `lib/financial-constants.ts`                  | `paymentStatusColors` uses raw green/yellow/red/blue                                |
| `types/unified-entry-types.ts`                | Entry status badges use raw colors                                                  |
| `lib/tableColumnConfig.ts`                    | Status/placement colors using raw classes                                           |
| `utils/entryManagementUtils.ts`               | Entry status rendering uses raw colors                                              |
| `types/user-permissions.ts`                   | Role badge colors using raw classes                                                 |

### Heavy Hardcoded Color Components

| File                                            | Occurrences                                    |
| ----------------------------------------------- | ---------------------------------------------- |
| `components/reports/PrintableReport.tsx`        | 43 (mostly gray for print — may be acceptable) |
| `components/analytics/AnalyticsDashboard.tsx`   | 28                                             |
| `components/secretary/ShowFinancialSummary.tsx` | 23                                             |
| `components/shows/ShowDetails/ShowMainCard.tsx` | 35                                             |
| `components/shows/wizard/steps/ReviewStep.tsx`  | 23                                             |
| `components/admin/PerformanceModeToggle.tsx`    | 23                                             |
| `components/alerts/AlertDashboard.tsx`          | 23                                             |
| `components/shows/ShowTemplateManager.tsx`      | 30                                             |

---

## Recommended New Semantic Tokens

### Status Tokens

```
--status-success    (replace emerald/green for positive states)
--status-warning    (replace amber/yellow for warning states)
--status-error      (replace red for error/destructive states)
--status-info       (replace blue for informational states)
--status-neutral    (replace gray/slate for inactive states)
--status-accent     (replace purple for at-gate/premium states)
```

### Pipeline Stage Tokens

```
--stage-setup       (replace yellow-500)
--stage-active      (replace green-500)
--stage-review      (replace blue-500)
--stage-closed      (replace gray/muted)
```

### Payment Status Tokens

```
--payment-paid      (replace green-100/green-800)
--payment-pending   (replace yellow-100/yellow-800)
--payment-refunded  (replace red-100/red-800)
--payment-waived    (replace blue-100/blue-800)
```

### Entry Status Tokens

```
--entry-accepted    (replace green)
--entry-waitlisted  (replace yellow)
--entry-declined    (replace red)
--entry-pending     (replace blue/orange)
```

---

## What Should NOT Be Converted

- **Decorative gradients** in `show-card-placeholders.ts` — intentionally varied per event type
- **Print report** styles in `PrintableReport.tsx` — print has different color needs
- **Landing page** (`Features.tsx`) — marketing colors are intentionally varied
- **Avatar/user gradients** in `utils.ts` — intentionally diverse for visual distinction

---

## Action Plan

1. **Fix 4 status color inconsistencies** between `check-in-types.ts`, `CheckInStatusBadge.tsx`, and `design-tokens.css`
2. **Define shared semantic tokens** in Tailwind config (CSS variables in `index.css`)
3. **Convert 6 status mapping files** to use new tokens
4. **Gradually convert** remaining ~30 component files
