import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PhaseShell } from '@/features/show-workbench/PhaseShell';
import { ShowDeskAdaptiveHeader } from './ShowDeskAdaptiveHeader';
import { ShowDeskCloseoutSection } from './ShowDeskCloseoutSection';
import { ShowDeskToolsSheet, type ShowDeskToolSection } from './ShowDeskToolsSheet';
import type { ShowDeskActionableTone } from './showDeskActionable';
import { ShowMapReorderBanner } from './ShowMapReorderBanner';
import { ShowMapEntryReviewSheet } from './ShowMapEntryReviewSheet';
import { ShowMapMoveUpDialog } from './ShowMapMoveUpDialog';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import { getTrialRegistry } from '@/features/registries';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getClassManagementHref } from '@/components/classes/classManagementFilters';
import { RelatedContextLinks } from '@/components/common/RelatedContextLinks';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapScratchNoShowDialog } from './ShowMapScratchNoShowDialog';
import ShowMapTab from './ShowMapTab';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { entryIdFromShowMapNodeId } from './showMapActionMutations';
import { computeShowDeskPendingSignals } from './showDeskPendingSignals';
import { computeShowDeskStatus } from './showDeskStatus';
import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type { ShowMapActionGroup } from './showMapActionGroups';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { ShowMapAction } from './showMapActions';
import type { ShowDeskPendingSignalId } from './showDeskPendingSignals';

const BULK_APPROVE_CONFIRMATION_THRESHOLD = 10;

interface ShowDeskPanelProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  scopeNow?: Date | undefined;
  // Composed at the page level so this panel never needs to know about
  // judges, incident options, broadcast classes, or other tool-specific
  // data dependencies. When omitted, the Tools sheet is not rendered.
  tools?: readonly ShowDeskToolSection[];
  // Aggregated attention count + tone for the Tools trigger badge, computed at
  // the page level (incidents + hospitality + tasks). The panel only forwards
  // it — it owns none of those data sources.
  actionableCount?: number;
  actionableTone?: ShowDeskActionableTone;
  // Composed at the page level — the closeout section renders only when
  // at least one class is wrap-up-eligible (see ShowDeskCloseoutSection).
  closeoutContent?: ReactNode;
}

// INTENT: Show Desk surface for Phase B2a. Owns the shared workbench state so
// the adaptive header and the compact-mode Show Map tree agree on tree,
// expandedNodeIds, dismissedGuidanceKeys, and executor. Dialogs render here
// (not inside the compact tree) so the header's action triggers share one
// dialog root with row-action triggers.
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
  closeoutContent,
}: ShowDeskPanelProps) {
  const state = useShowMapWorkbenchState({
    show,
    trials,
    classes,
    entries,
    showId: show.id,
    // Show Desk uses the unified (merged) action set — no phase fork.
    ...(scopeNow !== undefined && { scopeNow }),
    initialDayScope: 'all',
    initialCompletionScope: 'active',
  });

  const {
    tree,
    executor,
    navigateTo,
    guidanceAction,
    upNextGroups,
    runningNowItems,
    selectRunningNowClass,
    dismissGuidanceAction,
    runOrderAutoSort,
    reorderMode,
  } = state;
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
    bulkApproveEntries,
    isBulkApproving,
    isExecuting,
  } = executor;

  const reviewNode = reviewAction ? tree.nodesById[reviewAction.nodeId] : undefined;
  const reviewParent = reviewNode?.parentId ? tree.nodesById[reviewNode.parentId] : undefined;
  const reviewParentClassLabel =
    reviewNode?.type === 'dog-entry' ? reviewNode.dogEntryDisplay?.classLabel : reviewParent?.label;

  const [bulkApproveRequest, setBulkApproveRequest] = useState<{
    entryIds: string[];
    label: string;
    classId?: string | undefined;
  } | null>(null);

  const dispatchBulkApprove = useCallback(
    (entryIds: string[], classId: string | undefined) => {
      if (entryIds.length === 0) return;
      bulkApproveEntries(entryIds, classId);
    },
    [bulkApproveEntries]
  );

  const requestBulkApprove = useCallback(
    (entryIds: string[], label: string, classId: string | undefined) => {
      if (entryIds.length === 0) return;
      if (entryIds.length >= BULK_APPROVE_CONFIRMATION_THRESHOLD) {
        setBulkApproveRequest({
          entryIds,
          label,
          ...(classId ? { classId } : {}),
        });
      } else {
        dispatchBulkApprove(entryIds, classId);
      }
    },
    [dispatchBulkApprove]
  );

  const handleBulkApproveGroup = useCallback(
    (group: ShowMapActionGroup) => {
      const entryIds = group.items
        .map(item => entryIdFromShowMapNodeId(item.action.nodeId))
        .filter((id): id is string => Boolean(id));
      const repNode = tree.nodesById[group.representative.nodeId];
      const dogName = repNode?.entryDisplay?.dogName ?? 'this dog';
      const label = `${entryIds.length} ${entryIds.length === 1 ? 'entry' : 'entries'} for ${dogName}`;
      requestBulkApprove(entryIds, label, group.representative.classId);
    },
    [requestBulkApprove, tree]
  );

  const confirmBulkApprove = useCallback(() => {
    if (!bulkApproveRequest) return;
    dispatchBulkApprove(bulkApproveRequest.entryIds, bulkApproveRequest.classId);
    setBulkApproveRequest(null);
  }, [bulkApproveRequest, dispatchBulkApprove]);

  const openEntryManagement = useCallback(() => {
    navigateTo(getEntryManagementHref({ showId: show.id, attention: 'pending', mode: 'review' }));
  }, [navigateTo, show.id]);

  const desk = useMemo(
    () =>
      computeShowDeskStatus({
        show,
        trials,
        tree,
        ...(scopeNow !== undefined && { now: scopeNow }),
      }),
    [scopeNow, show, trials, tree]
  );
  const pendingSignals = useMemo(
    () => computeShowDeskPendingSignals({ showId: show.id, tree, entries }),
    [entries, show.id, tree]
  );
  // Pending signals surface staff-only operational counts (entry review,
  // check-in, payment, judge signature, closeout). Design Decision 5: staff
  // signals are not rendered for non-staff viewers — gate the chip row and
  // its click handler at the component boundary rather than assuming every
  // caller only mounts this panel for staff.
  const staffPendingSignals = useMemo(
    () => (canManageShow ? pendingSignals : []),
    [canManageShow, pendingSignals]
  );
  // A show's trials always share one registry (scoping §7) — resolve once from the
  // first trial so move-up recognizes UKC/ASCA-only levels (Superior/Elite, Open).
  const registryId = useMemo(() => getTrialRegistry(trials[0]).id, [trials]);
  const moveUpTargets = useMemo(
    () => buildMoveUpTargets(classes, moveUpAction?.classId, registryId),
    [classes, moveUpAction?.classId, registryId]
  );
  const moveUpCurrentClass = moveUpAction?.classId
    ? tree.nodesById[`class:${moveUpAction.classId}`]
    : undefined;

  // Related context links: Class Management only, and only when a
  // current/first trial id is already loaded in `trials` (no fetch added to
  // decorate the panel). Entry Management is deliberately NOT listed here —
  // it is already a primary section in the show nav and the destination of
  // the "Review N entries" chip; a third route was pure noise (MYK9-64 F2).
  const relatedLinks = useMemo(() => {
    if (!canManageShow) return [];
    const currentTrialId = trials[0]?.id;
    if (!currentTrialId) return [];
    return [
      {
        key: 'class-management',
        label: 'Class Management',
        href: getClassManagementHref({ showId: show.id, trialId: currentTrialId }),
      },
    ];
  }, [canManageShow, show.id, trials]);

  // Resolve each action's execution shape so the header can dispatch them.
  const startAction = useCallback(
    (action: ShowMapAction) => {
      const execution = resolveShowMapActionExecution(action);
      if (execution.kind === 'disabled') return;
      if (execution.kind === 'navigate') navigateTo(execution.href);
      else executeAction(action, execution);
    },
    [executeAction, navigateTo]
  );

  // INTENT: Pending-signal chips lead to the canonical owner of that work.
  // Entry review belongs to Entries Management; closeout belongs to Results &
  // Check-In. The Show Map attention lens stays a fallback for signals that
  // are genuinely represented in the tree.
  //
  // Payment-due is the one signal Show Desk has no clearing tooling for at
  // all (no payment UI here), so unlike the review/check-in chips — which
  // set a local Show Map filter because Show Desk offers bulk approve as a
  // partial clearing path — it always navigates straight to its typed
  // Entry Management href.
  const { setFilter } = state;
  const handlePendingSignal = useCallback(
    (signalId: ShowDeskPendingSignalId) => {
      if (signalId === 'entries-waiting-review') {
        openEntryManagement();
        return;
      }
      if (signalId === 'results-pending-closeout') {
        navigateTo(`/shows/${show.id}/results-control`);
        return;
      }
      if (signalId === 'entries-payment-due') {
        const href = pendingSignals.find(signal => signal.id === signalId)?.href;
        if (href) navigateTo(href);
        return;
      }
      setFilter('needs-attention');
    },
    [navigateTo, openEntryManagement, pendingSignals, setFilter, show.id]
  );

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
          className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          role="status"
          data-testid="show-desk-dormant-notice"
        >
          Show-day sections are waiting until the show window opens. Setup work stays in Setup;
          entries and readiness links remain available here.
        </div>
      )}
      <RelatedContextLinks items={relatedLinks} />
      <ShowDeskAdaptiveHeader
        showStatus={desk.status}
        statusSummary={desk.summary}
        guidanceAction={guidanceAction}
        upNextGroups={upNextGroups}
        runningNow={runningNowItems}
        pendingSignals={staffPendingSignals}
        onStartAction={startAction}
        onDismissGuidance={dismissGuidanceAction}
        onOpenRunning={navigateTo}
        onSelectRunning={selectRunningNowClass}
        onSelectPendingSignal={canManageShow ? handlePendingSignal : undefined}
        onBulkApproveGroup={canManageShow ? handleBulkApproveGroup : undefined}
      />
      {canManageShow && reorderMode.active && (
        <ShowMapReorderBanner
          active={reorderMode.active}
          isPersisting={reorderMode.isPersisting}
          onDone={reorderMode.exit}
        />
      )}
      {canManageShow && !reorderMode.active && runOrderAutoSort.lastAutoSort && (
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <span className="font-medium">Run order updated.</span>
              {runOrderAutoSort.lastAutoSort.classLabel && (
                <span className="text-muted-foreground">
                  {' '}
                  {runOrderAutoSort.lastAutoSort.classLabel}.
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runOrderAutoSort.undoLastAutoSort}
              disabled={runOrderAutoSort.isUndoingAutoSort}
            >
              <RotateCcw className="h-4 w-4" />
              {runOrderAutoSort.isUndoingAutoSort ? 'Undoing...' : 'Undo'}
            </Button>
          </div>
        </div>
      )}
      <ShowMapTab
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        canManageShow={canManageShow}
        compact
        workbenchState={state}
      />
      {closeoutContent && (
        <ShowDeskCloseoutSection tree={tree}>{closeoutContent}</ShowDeskCloseoutSection>
      )}
      {canManageShow && (
        <>
          <ShowMapMoveUpDialog
            key={moveUpAction?.nodeId ?? 'move-up-dialog'}
            open={Boolean(moveUpAction)}
            node={moveUpAction ? tree.nodesById[moveUpAction.nodeId] : undefined}
            currentClass={moveUpCurrentClass}
            targets={moveUpTargets}
            isSubmitting={isExecuting}
            onOpenChange={open => {
              if (!open) closeMoveUpDialog();
            }}
            onConfirm={confirmMoveUp}
          />
          <ShowMapScratchNoShowDialog
            key={scratchAction?.nodeId ?? 'scratch-dialog'}
            open={Boolean(scratchAction)}
            node={scratchAction ? tree.nodesById[scratchAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => {
              if (!open) closeScratchDialog();
            }}
            onConfirm={confirmScratchNoShow}
          />
          <ShowMapMessageHandlerDialog
            key={messageAction?.nodeId ?? 'message-handler-dialog'}
            open={Boolean(messageAction)}
            node={messageAction ? tree.nodesById[messageAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => {
              if (!open) closeMessageDialog();
            }}
            onConfirm={body => confirmMessageHandler({ body })}
          />
          <ShowMapEntryReviewSheet
            key={reviewAction?.nodeId ?? 'review-sheet'}
            open={Boolean(reviewAction)}
            onClose={closeReviewSheet}
            onApprove={confirmReviewApprove}
            isApproving={isApprovingReview}
            entryDisplay={reviewNode?.entryDisplay}
            parentClassLabel={reviewParentClassLabel}
          />
          <AlertDialog
            open={bulkApproveRequest !== null}
            onOpenChange={open => {
              if (!open) setBulkApproveRequest(null);
            }}
          >
            <AlertDialogContent data-testid="bulk-approve-confirmation">
              <AlertDialogHeader>
                <AlertDialogTitle>Approve {bulkApproveRequest?.label}?</AlertDialogTitle>
                <AlertDialogDescription>
                  These entries will be marked as confirmed. Handlers will see their registrations
                  move from "submitted" to "confirmed."
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isBulkApproving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmBulkApprove}
                  disabled={isBulkApproving}
                  data-testid="bulk-approve-confirm"
                >
                  Approve
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
