/**
 * The three callbacks `EntryListPage` wraps around its injected handler bag.
 *
 * Extracted from the page during the MYK9-260 collapse, which left it at 505
 * lines -- over the project's 500-line ceiling, and spending the last slot of
 * `qa:code-quality-ratchet` headroom. Each of these exists because the host
 * handler alone is not enough, and each carries a defect it was written to
 * prevent; keeping them together makes that a readable unit rather than three
 * asides in the middle of a render function.
 */
import { useCallback } from 'react';
import type { Entry } from '../../../stores/entryStore';
import type { PrintSortOrder, RenumberMode, RunOrderPreset, RunOrderScope } from '../dialogSlots';
import type { EntryListHandlers } from '../hookContracts';
import type { EntryListUiActions, EntryListUiState } from '../pageProps';
import { useAutoDismiss } from './useAutoDismiss';

export interface UseEntryListPageActionsDeps {
  handlers: EntryListHandlers;
  uiActions: EntryListUiActions;
  printDialogType: EntryListUiState['printDialogType'];
  /** The order currently on screen — seeded as the starting manual order. */
  currentEntries: Entry[];
}

export interface EntryListPageActions {
  handlePrintSortOrder: (selectedSortOrder: PrintSortOrder) => void;
  handleOpenDragMode: () => void;
  handleApplyRunOrder: (
    preset: RunOrderPreset,
    scope?: RunOrderScope,
    renumberMode?: RenumberMode
  ) => Promise<void>;
}

export function useEntryListPageActions({
  handlers,
  uiActions,
  printDialogType,
  currentEntries,
}: UseEntryListPageActionsDeps): EntryListPageActions {
  const { setPrintDialogType, setRunOrderDialogOpen, setManualOrder, setSortOrder } = uiActions;

  const handlePrintSortOrder = useCallback(
    (selectedSortOrder: PrintSortOrder) => {
      const type = printDialogType;
      setPrintDialogType(null);
      if (type === 'check-in') handlers.handlePrintCheckIn({ sortOrder: selectedSortOrder });
      else if (type === 'results')
        handlers.handlePrintResults({
          sortOrder: selectedSortOrder === 'run-order' ? 'placement' : 'armband',
        });
      else if (type === 'scoresheet')
        handlers.handlePrintScoresheet({ sortOrder: selectedSortOrder });
    },
    [printDialogType, handlers, setPrintDialogType]
  );

  // Entering drag mode: close the run-order dialog it was launched from,
  // snapshot the visible order as the starting manual order, and switch to
  // run-order sort.
  //
  // The shared host handler only flips `isDragMode`. That was survivable on the
  // single-class route, whose sort already defaults to 'run' -- but only until
  // the steward sorted by armband or placement first. On combined A/B it fails
  // every time: that mode sorts 'section-armband', which ignores the
  // exhibitorOrder a drop writes, so the reorder silently reverts under the
  // steward's finger the moment they let go.
  const handleOpenDragMode = useCallback(() => {
    setRunOrderDialogOpen(false);
    setManualOrder([...currentEntries]);
    handlers.handleOpenDragMode();
    setSortOrder('run');
  }, [setRunOrderDialogOpen, setManualOrder, currentEntries, handlers, setSortOrder]);

  // Applying a run-order preset: close the dialog, confirm, and drop back to
  // run-order sort so the steward SEES the order they just applied.
  //
  // This lived inside the combined page, which meant the single-class route --
  // where `showSuccessMessage` had no writer at all -- renumbered the whole ring
  // and said nothing. A steward who taps "Apply" and sees no acknowledgement has
  // no way to tell a completed renumber from one that never fired, and the
  // natural response is to apply it again.
  const showSuccess = useAutoDismiss(uiActions.setShowSuccessMessage, 2000);

  // Returns void, not the handler's boolean: this wrapper is consumed by the
  // RunOrderDialog, which fires it and forgets. The boolean is the HOST's
  // report to this page, and it stops here.
  const handleApplyRunOrder = useCallback(
    async (
      preset: RunOrderPreset,
      scope?: RunOrderScope,
      renumberMode?: RenumberMode
    ): Promise<void> => {
      // 'manual' applies no order -- it opens drag-to-reorder, which needs the
      // dialog closed, the manual order seeded and the sort switched, none of
      // which the host handler does.
      if (preset === 'manual') {
        handleOpenDragMode();
        return;
      }
      // The host REPORTS whether the order persisted (both hosts catch their own
      // failures and return false after toasting). A false report REJECTS here,
      // so the dialog awaiting this stays open on the steward's selection; only
      // a persisted order closes it and shows the success banner.
      const persisted = await handlers.handleApplyRunOrder(preset, scope, renumberMode);
      if (!persisted) throw new Error('Run order could not be saved');
      setRunOrderDialogOpen(false);
      showSuccess();
      setSortOrder('run');
    },
    [handlers, setRunOrderDialogOpen, showSuccess, setSortOrder, handleOpenDragMode]
  );

  return { handlePrintSortOrder, handleOpenDragMode, handleApplyRunOrder };
}
