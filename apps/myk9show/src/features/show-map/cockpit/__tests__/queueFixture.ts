import type { RunQueueEntry } from '@myk9/ringside/run-queue';

import type { ClassEntryState } from '../cockpitClassEntries';

/** The run-queue view `queueRowOf` builds for a hand-written cockpit row in the given state. */
export function queueFor(
  nodeId: string,
  armband: string | undefined,
  state: ClassEntryState,
  counted = true
): RunQueueEntry {
  const parsed = Number.parseInt(armband ?? '', 10);
  return {
    id: nodeId,
    armband: Number.isNaN(parsed) ? 0 : parsed,
    exhibitorOrder: null,
    isScored: state === 'scored',
    status:
      !counted || state === 'pulled' ? 'pulled' : state === 'in-ring' ? 'in-ring' : 'no-status',
    inRing: state === 'in-ring',
  };
}
