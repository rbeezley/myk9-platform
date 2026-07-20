import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { PhaseShell } from '@/features/show-workbench/PhaseShell';

import { SecretaryCockpit } from './cockpit/SecretaryCockpit';
import { buildSecretaryCockpitSnapshot } from './cockpit/buildSecretaryCockpitSnapshot';
import { buildClassPaperworkMap } from './cockpit/buildClassPaperworkMap';
import { useShowPaperworkPrints } from './cockpit/useShowPaperworkPrints';
import { ShowDeskToolsSheet, type ShowDeskToolSection } from './ShowDeskToolsSheet';
import { ShowMapEntryReviewSheet } from './ShowMapEntryReviewSheet';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapMoveUpDialog } from './ShowMapMoveUpDialog';
import { ShowMapScratchNoShowDialog } from './ShowMapScratchNoShowDialog';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import { computeShowDeskPendingSignals } from './showDeskPendingSignals';
import { computeShowDeskStatus } from './showDeskStatus';
import { getRankedActions } from './showMapActions';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type { ShowDeskActionableTone } from './showDeskActionable';
import type { BuildShowMapTreeInput } from './showMapTypes';
import { getTrialRegistry } from '@/features/registries';
import type { DbClass, DbEntry } from '@/types/database-mappings';

interface ShowDeskPanelProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  scopeNow?: Date | undefined;
  tools?: readonly ShowDeskToolSection[];
  actionableCount?: number | undefined;
  actionableTone?: ShowDeskActionableTone | undefined;
}

// INTENT: This is the secretary's live operations cockpit. It projects the
// existing Show Map data and action engine by Trial and Class; it does not own
// duplicate entry, score, report, or result workflows. Those remain deep links
// to their canonical pages.
export default function ShowDeskPanel({
  show,
  trials,
  classes,
  entries,
  canManageShow,
  scopeNow,
  tools,
  actionableCount,
  actionableTone,
}: ShowDeskPanelProps) {
  const location = useLocation();
  const state = useShowMapWorkbenchState({
    show,
    trials,
    classes,
    entries,
    showId: show.id,
    ...(scopeNow !== undefined && { scopeNow }),
    initialDayScope: 'all',
    initialCompletionScope: 'active',
  });
  const { tree, executor, navigateTo, effectiveScopeNow } = state;
  const {
    executeAction,
    moveUpAction,
    closeMoveUpDialog,
    confirmMoveUp,
    scratchAction,
    closeScratchDialog,
    confirmScratchNoShow,
    messageAction,
    closeMessageDialog,
    confirmMessageHandler,
    reviewAction,
    closeReviewSheet,
    confirmReviewApprove,
    isApprovingReview,
    isExecuting,
  } = executor;

  const pendingSignals = useMemo(
    () => (canManageShow ? computeShowDeskPendingSignals({ showId: show.id, tree, entries }) : []),
    [canManageShow, entries, show.id, tree]
  );
  const returnTo = `${location.pathname}${location.search}`;
  const paperworkPrints = useShowPaperworkPrints(show.id);
  const paperworkByClassId = useMemo(
    () =>
      buildClassPaperworkMap({
        showId: show.id,
        classes: classes.map(classItem => ({
          ...classItem,
          trial_id: classItem.trialId,
        })) as unknown as DbClass[],
        entries: entries as unknown as DbEntry[],
        records: paperworkPrints.data ?? [],
        returnTo,
      }),
    [classes, entries, paperworkPrints.data, returnTo, show.id]
  );
  const snapshot = useMemo(
    () =>
      buildSecretaryCockpitSnapshot({
        showId: show.id,
        trials,
        classes,
        tree,
        pendingSignals,
        returnTo,
        now: effectiveScopeNow,
        paperworkByClassId,
      }),
    [
      classes,
      effectiveScopeNow,
      paperworkByClassId,
      pendingSignals,
      returnTo,
      show.id,
      tree,
      trials,
    ]
  );
  const desk = useMemo(
    () => computeShowDeskStatus({ show, trials, tree, now: effectiveScopeNow }),
    [effectiveScopeNow, show, tree, trials]
  );

  const runCommand = useCallback(
    (commandId: string) => {
      const action = getRankedActions('root', { tree, now: effectiveScopeNow }).find(
        candidate => `${candidate.id}:${candidate.nodeId}` === commandId
      );
      if (!action) return;
      const execution = resolveShowMapActionExecution(action);
      if (execution.kind === 'disabled') return;
      if (execution.kind === 'navigate') navigateTo(execution.href);
      else executeAction(action, execution);
    },
    [effectiveScopeNow, executeAction, navigateTo, tree]
  );

  const registryId = getTrialRegistry(trials[0]).id;
  const moveUpTargets = buildMoveUpTargets(classes, moveUpAction?.classId, registryId);
  const moveUpCurrentClass = moveUpAction?.classId
    ? tree.nodesById[`class:${moveUpAction.classId}`]
    : undefined;
  const reviewNode = reviewAction ? tree.nodesById[reviewAction.nodeId] : undefined;
  const reviewParent = reviewNode?.parentId ? tree.nodesById[reviewNode.parentId] : undefined;

  return (
    <div className="space-y-4">
      <PhaseShell
        title="Show Desk"
        kicker="During the show"
        actions={
          tools && tools.length > 0 ? (
            <ShowDeskToolsSheet
              showId={show.id}
              tools={tools}
              {...(actionableCount !== undefined && { actionableCount })}
              {...(actionableTone !== undefined && { actionableTone })}
            />
          ) : undefined
        }
      />
      {desk.status === 'setup' && (
        <div
          className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          Show-day work has not started. Setup and entry work remain available from their normal
          pages.
        </div>
      )}
      <SecretaryCockpit snapshot={snapshot} canManageShow={canManageShow} onCommand={runCommand} />

      {canManageShow && (
        <>
          <ShowMapMoveUpDialog
            open={Boolean(moveUpAction)}
            node={moveUpAction ? tree.nodesById[moveUpAction.nodeId] : undefined}
            currentClass={moveUpCurrentClass}
            targets={moveUpTargets}
            isSubmitting={isExecuting}
            onOpenChange={open => !open && closeMoveUpDialog()}
            onConfirm={confirmMoveUp}
          />
          <ShowMapScratchNoShowDialog
            open={Boolean(scratchAction)}
            node={scratchAction ? tree.nodesById[scratchAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => !open && closeScratchDialog()}
            onConfirm={confirmScratchNoShow}
          />
          <ShowMapMessageHandlerDialog
            open={Boolean(messageAction)}
            node={messageAction ? tree.nodesById[messageAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => !open && closeMessageDialog()}
            onConfirm={body => confirmMessageHandler({ body })}
          />
          <ShowMapEntryReviewSheet
            open={Boolean(reviewAction)}
            onClose={closeReviewSheet}
            onApprove={confirmReviewApprove}
            isApproving={isApprovingReview}
            entryDisplay={reviewNode?.entryDisplay}
            parentClassLabel={
              reviewNode?.type === 'dog-entry'
                ? reviewNode.dogEntryDisplay?.classLabel
                : reviewParent?.label
            }
          />
        </>
      )}
    </div>
  );
}
