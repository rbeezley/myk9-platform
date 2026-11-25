import { sheetEntryState } from './sheetEntryRule.ts';
import type { EmergencyPacketInput, PacketReportEntry } from './types.ts';

/**
 * MYK9-2389: the saved Before-trial packet lists the same dogs, with the same statuses, as the
 * Reports sheets. `emergency_packet_input` returns every live entry with its raw statuses; this
 * applies the one shared rule (`sheetEntryState`, which the app's `buildPacketEntries` also uses)
 * and strips the raw statuses, so the renderer sees exactly what it sees in the app:
 *
 * - a declined entry and the source half of a move-up are dropped;
 * - a dog that will not run (Pending, Withdrawn, Pulled, Absent) carries `notRunningLabel`, so the
 *   check-in sheet lists it below the runners with no order and the scoresheet leaves it off;
 * - a dog the catalog leaves out carries `omitFromCatalog`.
 *
 * An entry with no status fields (the RPC before the MYK9-2389 migration) reads as a runner, which
 * is what that RPC's pre-filtered rows were, so this ships safely ahead of the migration.
 */
interface RpcEntryStatuses {
  entryStatus?: string | null;
  checkInStatus?: string | null;
  resultStatus?: string | null;
}

export function applySheetEntryRule(input: EmergencyPacketInput): EmergencyPacketInput {
  const entries = input.entries.flatMap((raw): PacketReportEntry[] => {
    const { entryStatus, checkInStatus, resultStatus, ...entry } = raw as PacketReportEntry &
      RpcEntryStatuses;
    const state = sheetEntryState({ entryStatus, checkInStatus, resultStatus });
    if (!state.listed) return [];
    if (!state.notRunningLabel) return [entry];
    return [
      {
        ...entry,
        notRunningLabel: state.notRunningLabel,
        ...(state.inCatalog ? {} : { omitFromCatalog: true }),
      },
    ];
  });
  return { ...input, entries };
}
