# Data Access Module Drift Plan

## Goal

Move myK9Show core data reads out of hooks, pages, routes, and components and
behind the canonical `services/database/<entity>/index.ts` modules. Core flows
should not know whether data came from IndexedDB replication, PostgREST fallback,
or joined table lookups.

## Current Inventory

Direct Supabase reads still appear in route/page/hook/component code. Initial
scan found these high-value clusters:

| Cluster | Representative files | Disposition |
| --- | --- | --- |
| Class route context | `routes/ClassDetailsRedirect.tsx` | Done: migrated to `services/database/classes`. |
| Schedule timeline reads | `hooks/queries/useScheduleTimeline.ts`, `hooks/queries/useTrialTimeline.ts` | Done: migrated to `services/database/trials`. |
| TV display reads | `pages/TVDisplay/useTVData.ts`, `pages/TVDisplay/useTVResults.ts` | Migrate next; core Class/Entry/Show read path. |
| Show-day and check-in reads | `hooks/queries/useShowDayData.ts`, `hooks/queries/useClassCheckInData.ts`, `pages/secretary/CheckInReportPage.tsx` | Migrate one workflow at a time; core Entry/Class read path. |
| Entry form and eligibility reads | `hooks/queries/useEntryFormData.ts`, `hooks/useEntryEligibility.ts`, `hooks/useClassAvailability.ts` | Migrate after show-day reads; mixed replicated and online-only side tables. |
| Auth/profile/role reads | `hooks/useAuth.ts`, `hooks/useExhibitorProfile.ts`, `hooks/queries/useUserRoles.ts`, admin user dialogs | Keep online/auth-adjacent unless a core offline workflow depends on them. |
| Reporting/export reads | `view_entry_with_results`, AKC submission data, secretary reports, armband labels | Follow-up review; reporting/export may remain online-only by design. |
| Admin/config reads | show visibility settings, volunteers, secretary tasks, billing, notification subscriptions | Follow-up review; likely admin/online exceptions. |

## Phases

1. Done: Migrate a small route-level core read: `ClassDetailsRedirect` resolves
   class route context via the Class data access module, not direct Supabase.
2. Done: Add or extend entity-module tests for the new read surface.
3. Done: Inventory the remaining direct reads into a table with disposition:
   migrate now, online-only exception, reporting/admin follow-up.
4. In progress: Migrate one core workflow cluster at a time, starting with the smallest
   offline-critical reads:
   - done: class route context
   - done: schedule timeline
   - TV display class/entry reads
   - show-day entry reads
   - class availability
   - check-in class/entry reads
5. Record intentional exceptions in `CONTEXT.md` or an ADR if they are
   load-bearing enough that future architecture reviews should not re-suggest
   them.

## Testing Phase

- Unit tests for each new or changed entity-module function.
- Focused hook/page tests where caller behavior changes.
- Run targeted Vitest files for changed modules.
- Run `pnpm --dir apps/myk9show typecheck` before completing each phase.
- Do not consider a phase complete until the targeted tests and typecheck pass.
