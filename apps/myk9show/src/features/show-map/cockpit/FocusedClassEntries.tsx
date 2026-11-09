import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { ShowMapStatusKind } from '../showMapTypes';
import {
  countClassEntries,
  runStatusDisplay,
  type SecretaryCockpitClassEntry,
} from './cockpitClassEntries';

// Same tokens the rest of the app uses for done / live / waiting / out, so a status reads alike.
const KIND_CLASS: Record<ShowMapStatusKind, string> = {
  complete: 'bg-success/15 text-success',
  active: 'bg-primary/15 text-primary',
  attention: 'bg-warning/15 text-warning',
  neutral: 'bg-muted text-muted-foreground',
  muted: 'bg-muted text-muted-foreground line-through decoration-1',
};

// Tight cells and wrapping Dog and Handler keep the table inside the ~600px focus column; the
// scroll wrapper stays as the fallback for narrower ones.
const CELL = 'px-2 py-2';

function StatusPill({ label, kind }: { label: string; kind: ShowMapStatusKind }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        KIND_CLASS[kind]
      )}
    >
      {label}
    </span>
  );
}

/** Entered, scored, in ring, still to run: derived from the same rows as the table below. */
export function ClassCountTiles({ entries }: { entries: readonly SecretaryCockpitClassEntry[] }) {
  const counts = countClassEntries(entries);
  const tiles = [
    { label: 'Entered', value: counts.entered },
    { label: 'Scored', value: counts.scored },
    { label: 'In ring', value: counts.inRing },
    { label: 'Still to run', value: counts.stillToRun },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="class-count-tiles">
      {tiles.map(tile => (
        <div key={tile.label} className="rounded-lg border bg-muted/30 px-4 py-3">
          <dt className="text-xs font-medium text-muted-foreground">{tile.label}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every entry in the class in run order with its run status, read-only (MYK9-1782). The last,
 * empty column is the per-dog menu's place (MYK9-1784).
 */
export function ClassEntriesTable({
  entries,
  hidden = 0,
}: {
  entries: readonly SecretaryCockpitClassEntry[];
  /** Entries the data left out; said aloud so a capped list never reads as the whole class. */
  hidden?: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No entries in this class yet.
      </p>
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
            <TableHead className="w-4 px-0">
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
                  {entry.place ?? '—'}
                </TableCell>
                <TableCell className={cn(CELL, 'font-medium tabular-nums')}>
                  {entry.armband ?? ''}
                </TableCell>
                <TableCell className={CELL}>
                  <div className="font-medium">{entry.dogName}</div>
                  {entry.breed && (
                    <div className="text-xs text-muted-foreground">{entry.breed}</div>
                  )}
                </TableCell>
                <TableCell className={CELL}>{entry.handler ?? ''}</TableCell>
                <TableCell className={CELL}>
                  {entry.checkIn && (
                    <StatusPill label={entry.checkIn.label} kind={entry.checkIn.kind} />
                  )}
                </TableCell>
                <TableCell className={CELL}>
                  <StatusPill label={run.label} kind={run.kind} />
                </TableCell>
                <TableCell className={CELL}>{entry.result ?? ''}</TableCell>
                <TableCell className="px-0" />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="class-entries-hidden">
          {hidden} more {hidden === 1 ? 'entry is' : 'entries are'} not shown here.
        </p>
      )}
    </>
  );
}
