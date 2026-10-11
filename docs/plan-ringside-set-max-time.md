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

1. **Server:** a `SECURITY DEFINER` RPC `ringside_update_class(p_class_id, p_fields jsonb,
p_expected_version)`, modelled on the latest `ringside_update_entry`
   (`20260925143700`). It has the same authorization tiers (manager / assigned judge / judge
   passcode claim with the generation check), an allow-list of `time_limit_seconds` only, a
   server-side rule-range check, nullable OCC on `classes.version`, and EXECUTE for
   `authenticated` only.
2. **Client upload:** class UPDATEs that touch only allow-listed columns route through the RPC
   in the replication upload path, mirroring `ringsideEntryRpc.ts`. Managers keep the direct
   path for everything else.
3. **Dialog:** a real M:SS input with the rule range shown and enforced. Save writes through
   `replicatedClassesTable.updateClass`, so the local replica and the scoresheet update at once,
   and the upload is queued.

## Non-goals

- Class status from ringside. It likely has the same denied-write gap, but is filed and verified
  separately.
- Area 2/3 times.

## Testing phase

- **SQL:** a behavioral test under `supabase/tests/` for each tier. It allows judge, judge
  passcode and manager; denies steward, exhibitor and other-show passcodes; rejects
  out-of-range values; and checks OCC conflicts. CI only.
- **Unit:** RPC routing, the range helper, the dialog (red first), and an offline queue → upload
  through the RPC.
- **Review floor:** `independent` (SECURITY DEFINER), via Codex. Codex is unavailable until
  2026-10-13, so it waits or the owner overrides.
