import {
  ENTRY_LIST_LABELS,
  getEntryListHref,
} from '@/components/entries/management/entryManagementViews';
import { CLASS_CHANGE_SOON_MINUTES } from './classChangeSoonMinutes';
import { trialStartInstant } from './trialStartInstant';
import { MOVE_UP_REQUEST_STATUSES } from './moveUpRequestStatuses';
import { getShowMapNodeId } from './showMapTree';
import type { ShowMapTree } from './showMapTypes';
import type { ShowDeskPendingSignal, ShowDeskPendingSignalScope } from './showDeskPendingSignals';

export { CLASS_CHANGE_SOON_MINUTES };

/** The trial facts "starting soon" reads: its day, its planned start and its time zone. */
export interface ClassChangeTrial {
  id: string;
  trialDate?: string | null | undefined;
  plannedStartTime?: string | null | undefined;
  timezone?: string | null | undefined;
}

interface ClassChangeEntry {
  entry_status?: string | null;
  class_id?: string | null;
  trial_id?: string | null;
  deleted_at?: string | null;
}

/** True when `now` is inside the half hour before the trial's planned start. */
function startsSoon(trial: ClassChangeTrial | undefined, now: Date): boolean {
  const startAt = trialStartInstant(trial);
  if (!startAt) return false;
  const start = startAt.getTime();
  const minutesAway = (start - now.getTime()) / 60_000;
  return minutesAway >= 0 && minutesAway <= CLASS_CHANGE_SOON_MINUTES;
}

/**
 * "2 class changes waiting", with ", 1 for a trial starting soon" when some start within 30
 * minutes (MYK9-2122). It counts the replicated entries Show Desk already holds, so it is the
 * Class changes list's own rows; the pill only opens that list. `now` unknown: no soon variant.
 */
export function buildClassChangeSignal(input: {
  showId: string;
  entries: readonly ClassChangeEntry[];
  tree: ShowMapTree;
  trials: readonly ClassChangeTrial[] | undefined;
  now: Date | null | undefined;
  scope: ShowDeskPendingSignalScope;
}): ShowDeskPendingSignal | null {
  const waitingStatuses: readonly string[] = MOVE_UP_REQUEST_STATUSES;
  const requests = input.entries.filter(
    entry => !entry.deleted_at && waitingStatuses.includes((entry.entry_status ?? '').trim())
  );
  if (requests.length === 0) return null;

  const trialsByNodeId = new Map(
    (input.trials ?? []).map(trial => [getShowMapNodeId('trial', trial.id), trial])
  );
  const soon = input.now
    ? requests.filter(entry => {
        const classNode = entry.class_id
          ? input.tree.nodesById[getShowMapNodeId('class', entry.class_id)]
          : undefined;
        const trialNodeId =
          classNode?.parentId ?? (entry.trial_id ? getShowMapNodeId('trial', entry.trial_id) : '');
        return startsSoon(trialsByNodeId.get(trialNodeId), input.now as Date);
      }).length
    : 0;

  const count = requests.length;
  const base = `${count} class ${count === 1 ? 'change' : 'changes'} waiting`;
  return {
    id: 'class-changes-waiting',
    count,
    // Waiting like the waitlist pills; urgent only when a trial is about to start.
    priority: soon > 0 ? 'high' : 'medium',
    label: soon > 0 ? `${base} · ${soon} for a trial starting soon` : base,
    href: getEntryListHref(input.showId, 'move-ups'),
    destinationName: ENTRY_LIST_LABELS['move-ups'],
    scope: input.scope,
  };
}
