import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { hydrateThenResolve } from '@/utils/hydrateThenResolve';
import { replicatedTrialsTable } from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrial } from '@/store/trial-store-types';
import { TrialManagementDialogs } from '@/components/trials/TrialDetail/TrialManagementDialogs';
import { SetupRowActionsMenu } from './SetupRowActionsMenu';

/**
 * Trial Edit / Delete from a row menu (MYK9-900), shared by Setup → Trials and
 * the show home's trial headings (MYK9-956). Both open the same panel and
 * dialog the trial's own page uses.
 *
 * `enabled` is the caller's manage gate: with it false, no dialog mounts.
 */
export function useTrialRowActions(showId: string, enabled: boolean) {
  const navigate = useNavigate();
  // The trial is a SNAPSHOT taken when the action starts: a successful delete removes it from
  // the store while the dialog is still finishing, and the dialog must not vanish or re-resolve
  // underneath itself.
  const [pendingTrialAction, setPendingTrialAction] = useState<{
    trial: SyncableTrial;
    action: 'edit' | 'delete';
    /** The request that started this action; a stale completion must not clear a newer one. */
    requestId: number;
  } | null>(null);
  const parentShow = useShowStore(state => state.shows.find(show => show.id === showId));
  // The edit/delete actions write through the trial STORE, which is not always the source of
  // these rows (a cold store is fed by the server read instead). Hydrate the store first, and
  // never open a dialog for a trial the store cannot resolve.
  const [hydratingTrialId, setHydratingTrialId] = useState<string | null>(null);
  // ONE action in flight: every row menu is locked while one resolves, and a result that is not
  // from the latest request is ignored.
  const latestActionRequest = useRef(0);
  const openTrialAction = async (trialId: string, action: 'edit' | 'delete') => {
    const request = ++latestActionRequest.current;
    setHydratingTrialId(trialId);
    try {
      // The store first; if the trial is not there, sync this show's trials into the replica and
      // reload the store (offline or a failed sync falls through to the error below).
      const trial = await hydrateThenResolve({
        readStore: () => useTrialStore.getState().trials.find(t => t.id === trialId),
        sync: () => replicatedTrialsTable.sync(showId, { forceFullSync: true }),
        reload: () => useTrialStore.getState().loadTrials(),
      });
      if (request !== latestActionRequest.current) return;
      if (!trial) {
        toast.error("We couldn't load this trial. Please refresh and try again.");
        return;
      }
      setPendingTrialAction({ trial, action, requestId: request });
    } catch {
      // Any unexpected failure reads the same as "not found": say so, never fail silently.
      if (request === latestActionRequest.current) {
        toast.error("We couldn't load this trial. Please refresh and try again.");
      }
    } finally {
      if (request === latestActionRequest.current) setHydratingTrialId(null);
    }
  };
  // Tied to the request that started the action: a late completion from an earlier one must not
  // clear a newer selection (and discard its edits).
  const finishTrialAction = (requestId: number) =>
    setPendingTrialAction(current => (current?.requestId === requestId ? null : current));

  /**
   * `withDetails` adds "Trial details" for surfaces whose trial row does not
   * already open the trial page (the show home's collapsible headings).
   */
  const trialRowMenu = (trialId: string, label: string, withDetails = false) => (
    <SetupRowActionsMenu
      subject="Trial"
      rowLabel={label}
      {...(withDetails && {
        extraActions: [
          {
            id: 'trial-details',
            label: 'Trial details',
            icon: <FileText />,
            onSelect: () =>
              navigate(
                `/shows/${encodeURIComponent(showId)}/trials/${encodeURIComponent(trialId)}`
              ),
          },
        ],
      })}
      busy={hydratingTrialId === trialId}
      locked={hydratingTrialId !== null || pendingTrialAction !== null}
      onEdit={() => void openTrialAction(trialId, 'edit')}
      onDelete={() => void openTrialAction(trialId, 'delete')}
    />
  );

  const trialDialogs =
    enabled && pendingTrialAction ? (
      // Mounted per selection with the trial and action together (and keyed by trial), so the
      // edit form initializes from THIS trial rather than opening against a late-arriving one.
      <TrialManagementDialogs
        key={pendingTrialAction.requestId}
        currentTrial={pendingTrialAction.trial}
        parentShow={parentShow}
        initialAction={pendingTrialAction.action}
        onActionFinished={() => finishTrialAction(pendingTrialAction.requestId)}
        onTrialDeleted={() => finishTrialAction(pendingTrialAction.requestId)}
      />
    ) : null;

  return { trialRowMenu, trialDialogs };
}
