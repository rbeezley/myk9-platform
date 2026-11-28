import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { ListKeyboardSensor } from './listKeyboardSensor';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { StatusPill } from './StatusPill';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { ClassEntryResultCell } from './ClassEntryResultCell';
import { ClassCheckInCell } from './ClassCheckInCell';
import { useClassCheckIn } from './useClassCheckIn';
import { ClassEntryRowMenu } from './ClassEntryRowMenu';
import { ChangeHandlerSheet } from './ChangeHandlerSheet';
import { entryEditHref } from './entryRowLinks';
import { useMarkEntryAbsent } from './useMarkEntryAbsent';
import { dayOfDogLabel } from '../dayOfMessages';
import { ClassPrintPanel } from './ClassPrintPanel';
import type {
  CockpitLifecycle,
  SecretaryCockpitPaperwork,
  SecretaryCockpitEntryAction,
  SecretaryCockpitRunOrderControls,
} from './secretaryCockpitTypes';
import { SortableClassEntryRow } from './SortableClassEntryRow';
import { useRunOrderPlacement } from './useRunOrderPlacement';
import { Button } from '@/components/ui/button';
import {
  RUN_ORDER_DRAG_INSTRUCTIONS,
  dropPosition,
  movableEntries,
  runOrderAnnouncements,
} from './runOrderDrag';
import {
  runQueuePreview,
  runStatusDisplay,
  type SecretaryCockpitClassEntry,
} from './cockpitClassEntries';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';
import { armbandAccessibleName } from '@/utils/armbandUtils';

// Tight cells and wrapping Dog and Handler keep the table inside the ~600px focus column; the
// scroll wrapper stays as the fallback for narrower ones. 4px above and below the 44-48px controls
// keeps a row at about 57px, so a laptop shows six of them under the pinned header (MYK9-1989).
const CELL = 'px-2 py-1';
/** The grip and menu cells: the control fills the width, the same 4px above and below. */
const CONTROL_CELL = 'w-11 px-0 py-1';
/** "#110 Hazel": how a dog is named in the grip, the announcements and the Undo summary. */
const dogLabel = dayOfDogLabel;
const NO_ACTIONS: readonly SecretaryCockpitEntryAction[] = [];
const LABEL_ITEMS: readonly SecretaryCockpitPaperwork[] = [
  { reportId: 'armband-labels', label: 'Armband labels', state: 'unknown' },
];

/**
 * The one dog in the ring (armband tile and call name) and the next few waiting, in run order.
 * The class's counts are not repeated here: the schedule card carries them, and the header does
 * when the card is not listed (MYK9-2141, MYK9-2143).
 */
export function InRingTile({
  entries,
  unread = false,
}: {
  entries: readonly SecretaryCockpitClassEntry[];
  /** The entries have not been read, so there is nobody true to name yet. */
  unread?: boolean;
}) {
  if (unread) return null;
  const { inRing, nextUp } = runQueuePreview(entries);
  return (
    <dl className="rounded-lg border bg-muted/30 px-4 py-3" data-testid="in-ring-tile">
      <dt className="text-xs font-medium text-muted-foreground">In ring</dt>
      <dd className="mt-1">
        {inRing ? (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="flex min-w-0 items-center gap-2">
              <ArmbandBadge armband={inRing.armband} className="h-9 min-w-9" />
              <span className="min-w-0 truncate text-lg font-semibold" title={inRing.dogName}>
                {inRing.dogName}
              </span>
            </span>
            <span className="sr-only">
              {[armbandAccessibleName(inRing.armband) ?? 'Armband not assigned', inRing.dogName]
                .filter(Boolean)
                .join(', ')}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Nobody in the ring</span>
        )}
        {nextUp.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
              Next up
            </span>
            <ul aria-label="Next up" className="flex flex-wrap gap-1.5">
              {nextUp.map(entry => (
                <li key={entry.nodeId} title={entry.dogName}>
                  <span aria-hidden="true">
                    <ArmbandBadge armband={entry.armband} className="h-7 min-w-7 text-xs" />
                  </span>
                  <span className="sr-only">
                    {[armbandAccessibleName(entry.armband) ?? 'Armband not assigned', entry.dogName]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </dd>
    </dl>
  );
}

/**
 * Every entry in the class in run order with its run status (MYK9-1782). The last column holds
 * the per-dog menu (MYK9-1798), empty for a row with no allowed action.
 */
export function ClassEntriesTable({
  entries,
  className,
  canChangeCheckIn = false,
  onRefreshEntries,
  putBackEntries,
  showName,
  hidden = 0,
  unread = false,
  rowMenu,
  reorder,
}: {
  /**
   * Managers only (MYK9-1872): drag a waiting dog to a new run-order slot on this list. The class
   * id and the shared run-order controls (the same write and Undo the presets use).
   */
  reorder?:
    { showId: string; classId: string; runOrder: SecretaryCockpitRunOrderControls } | undefined;
  /**
   * Managers only (MYK9-1798): per entry (by nodeId) the actions the engine allows today, and the
   * runner for a chosen commandId (ShowDeskPanel.runCommand). One prop so a menu is never dead.
   */
  rowMenu?:
    | {
        actions: ReadonlyMap<string, readonly SecretaryCockpitEntryAction[]>;
        /** The show and class ids: Edit entry's link and Mark absent's write are keyed on them. */
        showId: string;
        classId: string;
        /** The class's trial: the print panel's scope. */
        trialId: string;
        classLifecycle: CockpitLifecycle | null;
        onCommand: (commandId: string) => void;
      }
    | undefined;
  entries: readonly SecretaryCockpitClassEntry[];
  /** The class's name, for the Check-in picker and the Pull it can lead to. */
  className: string;
  /** Managers only: the Check-in cell opens the Check-in desk's status picker (MYK9-1797). */
  canChangeCheckIn?: boolean;
  /** Re-reads the page's entries after a write, so the table speaks for the stored status. */
  onRefreshEntries?: EntriesRefresh;
  /** The stored entries by id, so a real Pull can be put back from its row (MYK9-2038). */
  putBackEntries?: ReadonlyMap<string, EntryManagementEntry>;
  showName?: string | undefined;
  /** Entries the data left out; said aloud so a capped list never reads as the whole class. */
  hidden?: number;
  /** The entries have not been read; an empty list then is not "no entries". */
  unread?: boolean;
}) {
  const checkIn = useClassCheckIn(
    entries,
    className,
    canChangeCheckIn,
    onRefreshEntries,
    putBackEntries
  );
  const [labelEntryId, setLabelEntryId] = useState<string | null>(null);
  const [handlerEntryId, setHandlerEntryId] = useState<string | null>(null);
  const markAbsent = useMarkEntryAbsent({
    classId: rowMenu?.classId ?? '',
    className,
    onRefreshEntries,
  });
  // Who can move comes from the placement model the write uses, never from this table's states.
  const placement = useRunOrderPlacement(
    reorder?.showId ?? '',
    reorder?.classId ?? '',
    reorder !== undefined && entries.length > 0
  );
  const movable =
    reorder && placement.waitingIds
      ? // A Pending entry is waiting in the placement model but has no place in line (MYK9-2388).
        movableEntries(entries, placement.waitingIds).filter(entry => entry.state !== 'pending')
      : [];
  const canReorder = reorder !== undefined && movable.length >= 2;
  const movableIds = movable.map(entry => entry.nodeId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Not the stock KeyboardSensor: it lost ArrowDown presses inside the sticky panel (MYK9-1902).
    useSensor(ListKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (event: DragEndEvent) => {
    if (!reorder || reorder.runOrder.isAutoSorting) return;
    const activeId = String(event.active.id);
    const toPosition = dropPosition(movableIds, activeId, event.over && String(event.over.id));
    const moved = movable.find(entry => entry.nodeId === activeId);
    if (toPosition === null || !moved) return;
    const over = movable.find(entry => entry.nodeId === String(event.over?.id));
    if (!over) return;
    // The dog dropped on, not a number: the write resolves the slot against its own fresh read.
    reorder.runOrder.onPlaceEntry({
      classId: reorder.classId,
      entryId: moved.entryId,
      overEntryId: over.entryId,
      entryLabel: dogLabel(moved),
    });
  };
  const hiddenNote = hidden > 0 && (
    <p className="mt-2 text-xs text-muted-foreground" data-testid="class-entries-hidden">
      {hidden} more {hidden === 1 ? 'entry is' : 'entries are'} not shown here.
    </p>
  );
  if (entries.length === 0) {
    return (
      <>
        <p
          className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
          data-testid="class-entries-empty"
        >
          {unread
            ? 'The entries for this class have not loaded yet.'
            : 'No entries in this class yet.'}
        </p>
        {hiddenNote}
      </>
    );
  }
  const movableSet = new Set(movableIds);
  const table = (
    <Table scrollAreaLabel="Entries in run order" data-testid="class-entries-table">
      <TableHeader>
        <TableRow>
          {canReorder && (
            <TableHead className="w-11 px-0">
              <span className="sr-only">Move</span>
            </TableHead>
          )}
          <TableHead className={cn(CELL, 'w-8')}>#</TableHead>
          <TableHead className={CELL}>Armband</TableHead>
          <TableHead className={CELL}>Dog</TableHead>
          <TableHead className={CELL}>Handler</TableHead>
          <TableHead className={CELL}>Check-in</TableHead>
          <TableHead className={CELL}>Run status</TableHead>
          <TableHead className={CELL}>Result</TableHead>
          <TableHead className="w-11 px-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(entry => {
          const run = runStatusDisplay(entry);
          const cells = (
            <>
              <TableCell className={cn(CELL, 'tabular-nums text-muted-foreground')}>
                {entry.place ?? ''}
              </TableCell>
              <TableCell className={CELL}>
                <ArmbandBadge armband={entry.armband} className="h-8 min-w-8" />
              </TableCell>
              <TableCell className={CELL}>
                <div className="font-medium">{entry.dogName}</div>
                {entry.breed && <div className="text-xs text-muted-foreground">{entry.breed}</div>}
              </TableCell>
              <TableCell className={CELL}>{entry.handler ?? ''}</TableCell>
              <TableCell className={CELL}>
                <ClassCheckInCell entry={entry} checkIn={checkIn} />
              </TableCell>
              <TableCell className={CELL}>
                <StatusPill label={run.label} kind={run.kind} outlined={run.outlined ?? false} />
              </TableCell>
              <TableCell className={CELL}>
                <ClassEntryResultCell entry={entry} />
              </TableCell>
              <TableCell className="px-0 py-1">
                {rowMenu && (
                  <ClassEntryRowMenu
                    entry={entry}
                    editEntryHref={entryEditHref(rowMenu.showId, entry.entryId)}
                    classId={rowMenu.classId}
                    onMarkAbsent={markAbsent.request}
                    onPrintLabel={entry => setLabelEntryId(entry.entryId)}
                    classLifecycle={rowMenu.classLifecycle}
                    onChangeHandler={
                      putBackEntries?.has(entry.entryId)
                        ? row => setHandlerEntryId(row.entryId)
                        : undefined
                    }
                    actions={rowMenu.actions.get(entry.nodeId) ?? NO_ACTIONS}
                    onCommand={rowMenu.onCommand}
                  />
                )}
              </TableCell>
            </>
          );
          if (canReorder && movableSet.has(entry.nodeId)) {
            return (
              <SortableClassEntryRow
                key={entry.nodeId}
                id={entry.nodeId}
                label={`Drag ${dogLabel(entry)} to change run order`}
                disabled={reorder?.runOrder.isAutoSorting ?? false}
              >
                {cells}
              </SortableClassEntryRow>
            );
          }
          return (
            <TableRow
              key={entry.nodeId}
              data-testid="class-entry-row"
              data-entry-state={entry.state}
              className={entry.state === 'pending' ? 'text-muted-foreground' : undefined}
            >
              {canReorder && <TableCell className={CONTROL_CELL} />}
              {cells}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
  const loadError = reorder !== undefined && placement.isError && (
    <div
      role="alert"
      className="mb-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <span className="text-destructive">Couldn&rsquo;t load the run order.</span>
      <Button type="button" variant="outline" size="touch" onClick={placement.retry}>
        Try again
      </Button>
    </div>
  );
  return (
    <>
      {loadError}
      {canReorder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements: runOrderAnnouncements(
              movable.map(item => ({ id: item.nodeId, label: dogLabel(item) }))
            ),
            screenReaderInstructions: { draggable: RUN_ORDER_DRAG_INSTRUCTIONS },
          }}
        >
          <SortableContext items={movableIds} strategy={verticalListSortingStrategy}>
            {table}
          </SortableContext>
        </DndContext>
      ) : (
        table
      )}
      {hiddenNote}
      {checkIn.dialogs}
      {rowMenu && (
        <ChangeHandlerSheet
          entry={handlerEntryId ? (putBackEntries?.get(handlerEntryId) ?? null) : null}
          onClose={() => setHandlerEntryId(null)}
          onRefreshEntries={onRefreshEntries}
          showName={showName}
        />
      )}
      {rowMenu && (
        // The one print panel, opened on this dog's armband label (MYK9-2073).
        <ClassPrintPanel
          open={labelEntryId !== null}
          showId={rowMenu.showId}
          trialId={rowMenu.trialId}
          classId={rowMenu.classId}
          classLabel={className}
          items={LABEL_ITEMS}
          presetEntryId={labelEntryId ?? undefined}
          onClose={() => setLabelEntryId(null)}
        />
      )}
    </>
  );
}
