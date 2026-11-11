import { cn } from '@/lib/utils';
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
import { NEXT_UP_PREVIEW_LIMIT } from '@/features/at-show/atShowNextUpPreview';
import { ClassCheckInCell } from './ClassCheckInCell';
import { useClassCheckIn } from './useClassCheckIn';
import { ClassEntryRowMenu } from './ClassEntryRowMenu';
import type { SecretaryCockpitEntryAction } from './secretaryCockpitTypes';
import {
  countClassEntries,
  runStatusDisplay,
  type SecretaryCockpitClassEntry,
} from './cockpitClassEntries';

// Tight cells and wrapping Dog and Handler keep the table inside the ~600px focus column; the
// scroll wrapper stays as the fallback for narrower ones.
const CELL = 'px-2 py-2';
const NO_ACTIONS: readonly SecretaryCockpitEntryAction[] = [];

const TILE = 'rounded-lg border bg-muted/30 px-4 py-3';

/** The one dog in the ring (armband tile and call name) and the next few waiting, in run order. */
function InRingTile({ entries }: { entries: readonly SecretaryCockpitClassEntry[] }) {
  const inRing = entries.find(entry => entry.state === 'in-ring' && entry.counted);
  const nextUp = entries
    .filter(entry => entry.state === 'waiting' && entry.counted)
    .slice(0, NEXT_UP_PREVIEW_LIMIT);
  return (
    <div className={cn(TILE, 'col-span-2')} data-testid="in-ring-tile">
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
              {`Armband ${inRing.armband ?? 'not assigned'}, ${inRing.dogName}`}
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
                  <span className="sr-only">{`Armband ${entry.armband ?? 'not assigned'}, ${entry.dogName}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </dd>
    </div>
  );
}

/** Entered, scored, still to run as counts; the one in-ring dog and who is next as armbands. */
export function ClassCountTiles({
  entries,
  unread = false,
}: {
  entries: readonly SecretaryCockpitClassEntry[];
  /** The entries have not been read, so there is nothing true to count yet. */
  unread?: boolean;
}) {
  if (unread) return null;
  const counts = countClassEntries(entries);
  const tiles = [
    { label: 'Entered', value: counts.entered },
    { label: 'Scored', value: counts.scored },
    { label: 'Still to run', value: counts.stillToRun },
  ];
  return (
    // The panel decides the columns, not the window: in the split its focus column can be 360px
    // on a wide screen, where five tiles would not fit.
    <div className="w-full [container-type:inline-size]">
      <dl
        className="grid grid-cols-2 gap-3 [@container(min-width:36rem)]:grid-cols-5"
        data-testid="class-count-tiles"
      >
        {tiles.map(tile => (
          <div key={tile.label} className={TILE}>
            <dt className="text-xs font-medium text-muted-foreground">{tile.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
        <InRingTile entries={entries} />
      </dl>
    </div>
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
  hidden = 0,
  unread = false,
  rowMenu,
}: {
  /**
   * Managers only (MYK9-1798): per entry (by nodeId) the actions the engine allows today, and the
   * runner for a chosen commandId (ShowDeskPanel.runCommand). One prop so a menu is never dead.
   */
  rowMenu?:
    | {
        actions: ReadonlyMap<string, readonly SecretaryCockpitEntryAction[]>;
        onCommand: (commandId: string) => void;
      }
    | undefined;
  entries: readonly SecretaryCockpitClassEntry[];
  /** The class's name, for the Check-in picker and the Pull it can lead to. */
  className: string;
  /** Managers only: the Check-in cell opens the Check-in desk's status picker (MYK9-1797). */
  canChangeCheckIn?: boolean;
  /** Re-reads the page's entries after a write, so the table speaks for the stored status. */
  onRefreshEntries?: () => void | Promise<void>;
  /** Entries the data left out; said aloud so a capped list never reads as the whole class. */
  hidden?: number;
  /** The entries have not been read; an empty list then is not "no entries". */
  unread?: boolean;
}) {
  const checkIn = useClassCheckIn(entries, className, canChangeCheckIn, onRefreshEntries);
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
  return (
    <>
      <Table scrollAreaLabel="Entries in run order" data-testid="class-entries-table">
        <TableHeader>
          <TableRow>
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
            return (
              <TableRow key={entry.nodeId} data-testid="class-entry-row">
                <TableCell className={cn(CELL, 'tabular-nums text-muted-foreground')}>
                  {entry.place ?? ''}
                </TableCell>
                <TableCell className={CELL}>
                  <ArmbandBadge armband={entry.armband} className="h-8 min-w-8" />
                </TableCell>
                <TableCell className={CELL}>
                  <div className="font-medium">{entry.dogName}</div>
                  {entry.breed && (
                    <div className="text-xs text-muted-foreground">{entry.breed}</div>
                  )}
                </TableCell>
                <TableCell className={CELL}>{entry.handler ?? ''}</TableCell>
                <TableCell className={CELL}>
                  <ClassCheckInCell entry={entry} checkIn={checkIn} />
                </TableCell>
                <TableCell className={CELL}>
                  <StatusPill label={run.label} kind={run.kind} outlined={run.outlined ?? false} />
                </TableCell>
                <TableCell className={CELL}>{entry.result ?? ''}</TableCell>
                <TableCell className="px-0">
                  {rowMenu && (
                    <ClassEntryRowMenu
                      dogName={entry.dogName}
                      armband={entry.armband}
                      actions={rowMenu.actions.get(entry.nodeId) ?? NO_ACTIONS}
                      onCommand={rowMenu.onCommand}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hiddenNote}
      {checkIn.dialogs}
    </>
  );
}
