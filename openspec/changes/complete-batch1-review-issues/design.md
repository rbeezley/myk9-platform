# Design

## Context

PR #3003 already consolidates the registration editor. #3008 and #3022 already share chronological ordering across My Shows, People at show and My run schedule. Remaining failures are lost Registration Date and unreadable-show classification/counts.

## Goals / Non-Goals

Complete the issue criteria on existing surfaces. Preserve strict schema, searchable breed combobox, status normalization, money calculations, owner-scoped reads and all INTENT comments. Do not modify held-entry work in #3017 or broaden data visibility.

## Decisions

- Keep the existing form and both save contracts. Carry optional registrationDate from Add Dog through DogInput, online and queued RPC inputs, local placeholders and reload reads. Extend the latest atomic RPC definition with a nullable date insert; invalid input fails atomically rather than creating a partial dog.
- Reuse already-merged compareClassSchedule; verify both online and replica start_time projections and all three surfaces. No second comparator or new schedule UI.
- Keep unreadable entries visible under Show not published yet, with no fabricated date. Replace Unknown Class with explicit unpublished or unavailable copy. Derive counters from the same grouped class-entry scope and status narrowing the list uses. Keep original order IDs for receipts/scoped links and all financial derivations.
- Reconcile the dog-strip/activity count using the existing sanctioned read/model and truthful date-known scope; test unresolved, dated, completed and mixed-order cases before implementation selection.

## Migration Plan

Choose a unique timestamp against origin/main, open PR migration names and the linked DB. Review final head, merge, dry-run and push only the intended additive function replacement, then verify applied function and ACLs. Deploy a green main commit containing all fixes via Deploy myK9Show and record the selected COMMIT_SHA/live build. Existing clients remain compatible; rollback frontend separately if needed, keep the optional nullable RPC support.

## Risks / Trade-offs

- Concurrent #3017 changes registration hosts but not this RPC: preserve its assumptions and resolve integration after a fresh main fetch before review.
- Counter scope can drift from grouping: test actual list cardinality under time/status filters, multiple dogs/orders and unreadable shows.
- Offline values can disappear on mirror/reload: assert queued args and local rows, then verify browser reload/readback.
- Shared fixture verification: use disposable test-account records, preserve prior values and remove only owned fixtures; no payments or emails.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: migration and online/offline registration data flow plus shared exhibitor counters.

## Verification method refinement

Persistent demo fixtures are unnecessary. Automatic approval review declined them; use isolated read-only browser response fixtures for 9 AM / 10 AM / untimed ordering, and an authenticated live RPC plus owned-row date readback in a single rolled-back transaction. Real shared-form save contracts and roster/detail reload projections are covered by tests. This preserves the acceptance requirements while avoiding new shared records; no fixture authorization is pending.
