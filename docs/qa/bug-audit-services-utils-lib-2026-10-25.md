# Bug audit: services/, utils/, lib/ (2026-10-25)

- **Rotation:** ISO week 43 → IDX 3 → scope `apps/myk9show/src/services/`, `utils/`, `lib/` (Fable)
- **Baseline:** `359306bfa` (worktree cut from `origin/main`)
- **Method:** static review by one Fable reviewer (no sub-agents; 389k subagent tokens, 90 tool calls, 22 min, two resumes after API 529 overloads). Every finding was re-read against source before filing.
- **Prior sweep of this scope:** 2026-09-01 (MYK9-310..314, all closed). None recurred.

## Filed

| Id        | P   | Finding                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                             |
| --------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-1405 | P1  | Saving a class in the Class Edit panel rewrites `classes.start_time` from the "Class Order" field: 09:30 → 09:00, unset → 01:00, `24` → 22008                                                             | `services/mappers/classMappers.ts:196-198`, `:254`, `:390-394`; `components/panels/edit/ClassEditPanel.helpers.ts:47-51`; mounted by `TrialManagementDialogs.tsx:81`, `SetupClassDialogs.tsx:25`, `ClassDetailsPage` |
| MYK9-1406 | —   | Parent for the P2/P3 findings below                                                                                                                                                                       |                                                                                                                                                                                                                      |
| MYK9-1407 | P2  | Comp / Undo-comp overwrite a paid entry's `payment_status` (paid → waived → pending); no client gate, no server trigger                                                                                   | `services/database/entries/writes.ts:292-356`; `components/entries/management/EntryListCard.tsx:231-243`                                                                                                             |
| MYK9-1408 | P2  | `getPendingEntries` has no `deleted_at` filter, so the Secretary Dashboard "needs review" strip counts soft-deleted entries                                                                               | `services/database/entries/secretary.ts:51-73`; RLS `20260730170000`; `soft_delete_entry` `20261001235300:90-92`                                                                                                     |
| MYK9-1409 | P2  | `RoleManager.updateRole`/`createRole` discard the errors of the `role_permissions` delete, lookup and insert; a role can be left with zero permissions while the page and audit log report success        | `services/rbac/RoleManager.ts:505-517`, `:571-586`                                                                                                                                                                   |
| MYK9-1410 | P3  | The cold-device PostgREST fallback for Entry Management reads `withdrawal_reason_code` but never merges it onto the row                                                                                   | `services/database/entries/secretaryPostgrest.ts:176-178`, `:199`                                                                                                                                                    |
| MYK9-1411 | P3  | The armband start silently falls back to 100 when the `starting_armband_number` read fails                                                                                                                | `services/database/armbands/secretary.ts:27-36`                                                                                                                                                                      |
| MYK9-1412 | P3  | Dead code left over from MYK9-313: `PaymentService` (whole module), six `entries/secretary.ts` writers, six `entries/lifecycle.ts` transitions, `getActiveShows`, the app copy of `formatDayAbbreviation` | grep-count table in the issue                                                                                                                                                                                        |

Severity note: the reviewer rated the start-time finding P2. I raised it to P1. Any edit to any class, from three surfaces, silently changes the published schedule time, and the only recovery is to re-set each time by hand in the schedule editor.

Dedupe: each finding was searched with `includeArchived: true` on symptom, file and column. The closest match was MYK9-69 (the start-time field in the same panel dropped its value). It is closed and is a different defect; MYK9-1405 cites it. The relation could not be added because MYK9-69 is archived.

No open PR touches `apps/myk9show/src/{services,utils,lib}/` (checked by file at filing time).

## Dropped or not filed

Nothing the reviewer reported failed verification. The reviewer looked at and chose not to file:

- **UTC "today" fallbacks** at `showMappers.ts:222-225` (`assignedDate`) and `classMappers.ts:255` (`trialDate`): fallback-only paths in the MYK9-1198 family. Noted, not filed.
- **`getAnnouncementsByShow` ignoring the `show_announcement_reads` error:** every announcement reads as unread for one render. Cosmetic.
- **Admin `restoreEntry` not calling `forgetServerDeletion`:** the next incremental sync clears it, through the version-bump trigger. Transient.
- **`mapClassInputToInsert`'s `status: 'Scheduled'` default violating `classes_status_check`:** that insert path has no callers.

## Coverage

**Read closely:** `services/database/entries/` (writes, reads, search, userEntries*, secretary*, lifecycle, withdrawEligibility, entryStatusUpdate, statusCheckIn, admin, publicReads); `services/replication/` entries mapper, waitlist table, judge-assignments mapper, moveUpEntryRpc, ringsideEntryRpc, scoreResetFields, showCalendarDays, entriesShowSyncState, scopeAccountStamp, and slices of the Entries, Shows and Classes tables; `services/mappers/entryMappers.ts` and `classMappers.ts`; `services/payment/PaymentService.ts`, `lib/stripe.ts`, `lib/financial-constants.ts`; `lib/reports/` (reportUtils, judgeDayScope, highCombinedDivision, toScoresheetModel, highInTrial 1-200); `utils/` date helpers (calendarDate, dateLocal, date-format, dateFormat), entryStatusUtils, checkInTransitions, errorMessages, effectivePaymentStatus; `services/scoring/PlacementCalculatorService.helpers.ts`; `services/rbac/RoleManager.ts` 495-590; `services/database/armbands/secretary.ts`.

**Skimmed or grep-only:** ReplicatedTrialsTable; ReplicatedClassesTable enrichment (MYK9-1360 is open, so it was not reviewed); the rest of `services/database/*`, swept only for the discarded-`error` pattern; `lib/reports/catalogFields.ts`; highInTrial 200-462.

**Skipped (next pass of this scope starts here):** `services/scoring/PlacementCalculatorService.ts`, the `OfflineScoringService` body, `JudgeWorkflowManager.ts`; `services/database/waitlists/*`, `day-of-operations/*`; the replication tables for dogs, clubs, armbands, paperwork prints and show-desk people; `utils/` outside the date, entry-status and error set; `lib/` outside reports, stripe and financial-constants; `services/{analytics,notifications,offline,pwa,sync,workers,secretary,show-day}`.

**Checked and found clean (do not re-derive):** `isEntryCloseDayPast` / `canModifyEntry` (the MYK9-310 fix holds); the `entries_protect_payment_*` triggers against the client writes, apart from comp; `getEntriesByShowForFinancials` skipping the foreign-scope assert (a foreign stamp falls back online); `classes_status_check` allows `setup` (migration 138); the `stripe.ts` success and cancel routes all resolve; placement tie handling (display-only, server-authoritative); `getUpcomingShows` compares calendar days; `withdrawEligibility`, `statusCheckIn`, `entryStatusUpdate`, the money gate in `userEntriesRead`, `publicReads`, and `admin`.
