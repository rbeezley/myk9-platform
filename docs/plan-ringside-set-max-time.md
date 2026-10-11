# Ringside: set a class's max time

> **Status:** Active

MYK9-1086 follow-up. Since #2894 a class with no saved max time runs with no limit and the
ringside scoresheet tells the judge to ask the secretary. AKC leaves Interior, Exterior,
Detective and Handler Discrimination above Novice to the judge, so the judge needs to set the
time at ringside. Today the at-show "Set Max Time" dialog
(`apps/myk9show/src/features/at-show/slots/classDialogs.tsx`) has no input, and classes have
no ringside write path: `classes_update` RLS allows only `can_manage_trial`.

## Owner decisions (2026-10-10)

- **Offline:** queue it. A change made with no signal is applied locally at once and uploaded
  later, like scores.
- **Range:** enforce the rule range. AKC judge-set classes: within the rule's min–max. Classes
  with a fixed rule time (UKC, ASCA Open, AKC fixed): at or below it. Otherwise 0:01–15:00.
- **Who:** the class's assigned judge, a judge/admin passcode for the show, and managers
  (site admin, trial secretary, club admin). Not stewards or exhibitors.

## Design

Two PRs (owner, 2026-10-10: "foundation + status first").

**PR 1: judge write path, class status, max time.**

1. **Server:** a `SECURITY DEFINER` RPC `ringside_update_class(p_class_id, p_fields jsonb,
p_expected_version)`, modelled on the latest `ringside_update_entry`.
   - **Tiers:** manager / assigned judge / judge passcode claim with the generation check. No
     steward tier.
   - **Allow-list:** `status` (upcoming / setup / in_progress / completed; cancelling stays on
     the manager path), `start_time` and `time_limit_seconds`.
   - **Rule range:** checked for judges and passcodes; managers are not range-checked, as on
     the direct path.
   - **OCC:** nullable, with the version in DETAIL. A replay of an applied value returns
     success (MYK9-740 parity).
   - **Grants:** EXECUTE for `authenticated` only.
2. **Upload routing:** `ringsideClassRpc.ts`, a mirror of `ringsideEntryRpc.ts`. A class
   UPDATE touching only those columns is queued with
   `rpc: { name, idParam: 'p_class_id', fields }`. `@myk9/replication` gains `rpc.idParam`, so
   the RPC re-reads `serverVersion` at upload. This fixes MYK9-1096: a judge's ringside class
   status change now reaches the server.
3. **Dialog:** `slots/MaxTimeDialog.tsx`, a real M:SS input (0:01–15:00). It saves through
   `replicatedClassesTable.updateClass`, so it applies locally at once and is queued offline,
   and it sets both classes of a pair.

**PR 2:**

- Show the rule range in the dialog, offline: class rows are enriched at sync, like hide counts.
- Open the dialog from combined A/B lists. Combined mode hides class options today, and AKC
  Interior and Exterior Novice are judge-set and run combined.

## Non-goals

- Area 2/3 times.

## Testing phase

- **SQL:**
  - `supabase/tests/myk9_1086_ringside_update_class_test.sql` (CI only) covers each tier, the
    range, the allow-list, status and start time, OCC and replay, NULL clears, and grants.
  - The same scenarios were run red-green on a throwaway local Postgres, with a mutation check.
- **Unit:** RPC routing, `updateClass` queue routing, the executor `idParam`, and the dialog.
  All were red first.
- **Review floor:** `independent` (SECURITY DEFINER), via Codex.
