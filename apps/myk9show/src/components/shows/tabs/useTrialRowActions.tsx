import { useCallback, useRef, useState } from 'react';
import { FileText, Plus, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { hydrateThenResolve } from '@/utils/hydrateThenResolve';
import { replicatedTrialsTable } from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrial } from '@/store/trial-store-types';
import { TrialManagementDialogs } from '@/components/trials/TrialDetail/TrialManagementDialogs';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { SetupRowActionsMenu } from './SetupRowActionsMenu';

/**
 * Trial Edit / Delete from a row menu (MYK9-900), shared by Setup → Trials and
 * the show home's trial headings (MYK9-956). Both open the same panel and
 * dialog the trial's own page uses.
 *
 * `enabled` is the caller's manage gate: with it false, no dialog mounts.
 */
/** Each registry's High in Trial report; UKC has none. */
const HIGH_IN_TRIAL_REPORT_ID: Record<string, string> = {
  AKC: 'high-in-trial',
  ASCA: 'asca-high-in-trial',
};

/** Each registry's end-of-trial report, the paperwork filed once per trial (MYK9-1727). */
const TRIAL_REPORT_ID: Record<string, string> = {
  AKC: 'trial-secretary-report',
  UKC: 'ukc-nosework-trial-report',
  ASCA: 'asca-scent-detection-trial-report',
};

function trialReportHref(showId: string, trialId: string, reportId: string): string {
  return `/shows/${encodeURIComponent(showId)}/reports?${new URLSearchParams({ report: reportId, trialId }).toString()}`;
}

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
  const openTrialAction = useCallback(
    async (trialId: string, action: 'edit' | 'delete') => {
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
    },
    [showId]
  );
  // Tied to the request that started the action: a late completion from an earlier one must not
  // clear a newer selection (and discard its edits).
  const finishTrialAction = (requestId: number) =>
    setPendingTrialAction(current => (current?.requestId === requestId ? null : current));

  /**
   * `withDetails` is the show home's collapsible trial heading: it adds "Trial
   * details" (the heading does not open the trial page) and leaves Delete to
   * the edit panel's footer. It also carries Add classes, High in Trial (AKC awards it) and the
   * registry's Trial report, from `registryId`, so the heading keeps only the menu (MYK9-1727).
   */
  // Memoized on what it renders: TrialsTab's table builds its actions column from this, and a
  // new function each render replaced the column and closed an open menu on any parent render
  // (Codex review of #2691).
  const actionLocked = hydratingTrialId !== null || pendingTrialAction !== null;
  const trialRowMenu = useCallback(
    (trialId: string, label: string, withDetails = false, registryId?: string) => (
      <SetupRowActionsMenu
        subject="Trial"
        rowLabel={label}
        {...(withDetails && {
          extraActions: [
            {
              id: 'trial-add-classes',
              label: 'Add classes',
              icon: <Plus />,
              onSelect: () => navigate(getAddClassesHref(showId, trialId)),
            },
            {
              // The registry's High in Trial report, already scoped to this trial (MYK9-1727).
              id: 'trial-high-in-trial',
              label: 'High in Trial',
              icon: <Trophy />,
              hidden: !registryId || !HIGH_IN_TRIAL_REPORT_ID[registryId],
              onSelect: () =>
                navigate(
                  trialReportHref(showId, trialId, HIGH_IN_TRIAL_REPORT_ID[registryId ?? ''] ?? '')
                ),
            },
            {
              // The registry's end-of-trial report, already set to this trial (MYK9-1727).
              id: 'trial-report',
              label: 'Trial report',
              icon: <FileText />,
              hidden: !registryId || !TRIAL_REPORT_ID[registryId],
              onSelect: () =>
                navigate(trialReportHref(showId, trialId, TRIAL_REPORT_ID[registryId ?? ''] ?? '')),
            },
            // No "Entry forms" or "Trial financials" here (owner, 2026-11-06, MYK9-1727): the
            // Entry Forms and Reports tabs sit just above, so the menu holds trial-level work only.
          ],
        })}
        busy={hydratingTrialId === trialId}
        locked={actionLocked}
        onEdit={() => void openTrialAction(trialId, 'edit')}
        // On the show home, Delete is only in the trial edit panel's footer
        // (owner, 2026-10-03; docs/archive/plan-crud-standard.md placement).
        onDelete={withDetails ? undefined : () => void openTrialAction(trialId, 'delete')}
      />
    ),
    [actionLocked, hydratingTrialId, navigate, openTrialAction, showId]
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

  return {
    trialRowMenu,
    trialDialogs,
  };
}
