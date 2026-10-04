import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { classPlacementKey, loadClassPlacement } from '../classPlacementSource';
import {
  buildHandPlacementSections,
  type HandPlacementReadOnlyRow,
  type HandPlacementRow,
} from '../showMapHandPlacement';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

function HandPlacementRowItem({
  row,
  classId,
  runOrder,
}: {
  row: HandPlacementRow;
  classId: string;
  runOrder: SecretaryCockpitRunOrderControls;
}) {
  const place = (toPosition: number) =>
    runOrder.onPlaceEntry({ classId, entryId: row.id, toPosition, entryLabel: row.label });
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
        {row.position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.label}</div>
        {row.subtitle && (
          <div className="truncate text-xs text-muted-foreground">{row.subtitle}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={row.upTo === null || runOrder.isAutoSorting}
          aria-label={`Move ${row.label} up`}
          onClick={() => row.upTo !== null && place(row.upTo)}
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={row.downTo === null || runOrder.isAutoSorting}
          aria-label={`Move ${row.label} down`}
          onClick={() => row.downTo !== null && place(row.downTo)}
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
        {/* A native select: keyboard, screen reader and phone pickers for free. */}
        <select
          className="h-11 rounded-md border bg-background px-2 text-sm"
          aria-label={`Move ${row.label} to position`}
          value=""
          disabled={runOrder.isAutoSorting}
          onChange={event => {
            const toPosition = Number(event.target.value);
            if (toPosition > 0) place(toPosition);
          }}
        >
          <option value="">Move to…</option>
          {row.destinations.map(position => (
            <option key={position} value={position}>
              Position {position}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

/** Dogs that ran or are in the ring: listed for reference, never moved. */
function ReadOnlySection({ title, rows }: { title: string; rows: HandPlacementReadOnlyRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-1 divide-y rounded-md border" aria-label={title}>
        {rows.map(row => (
          <li key={row.id} className="px-3 py-2">
            <div className="truncate text-sm font-medium">
              {row.label}
              {row.note && <span className="font-normal text-muted-foreground"> ({row.note})</span>}
            </div>
            {row.subtitle && (
              <div className="truncate text-xs text-muted-foreground">{row.subtitle}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Undo offer for the last run-order change in this class (preset or hand). */
export function RunOrderUndoNotice({
  classId,
  runOrder,
}: {
  classId: string;
  runOrder: SecretaryCockpitRunOrderControls;
}) {
  if (!runOrder.lastChange || runOrder.lastChange.classId !== classId) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
    >
      <span>{runOrder.lastChange.summary}</span>
      <Button
        type="button"
        variant="outline"
        size="touch"
        disabled={runOrder.isAutoSorting}
        onClick={runOrder.onUndo}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Undo
      </Button>
    </div>
  );
}

/**
 * Hand placement for one class (MYK9-972): move a dog up or down one slot, or
 * to a chosen position. Only dogs still waiting to run are in the list; dogs
 * that have run or are in the ring are shown below it and never change.
 */
export function RunOrderHandPlacement({
  showId,
  classId,
  runOrder,
  onDone,
}: {
  showId: string;
  classId: string;
  runOrder: SecretaryCockpitRunOrderControls;
  onDone: () => void;
}) {
  // Same loader the mutation uses, so the rows are the slots a write targets.
  // Keyed under the class's entries, so every entry write refreshes it.
  const {
    data: placement,
    isError,
    refetch,
  } = useQuery({
    queryKey: classPlacementKey(showId, classId),
    queryFn: () => loadClassPlacement(showId, classId),
    networkMode: 'always',
  });
  const sections = useMemo(
    () => (placement ? buildHandPlacementSections(placement) : null),
    [placement]
  );
  const rows = sections?.waiting ?? [];

  return (
    <section aria-labelledby="run-order-by-hand">
      <div className="flex items-center justify-between gap-3">
        <h3
          id="run-order-by-hand"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        >
          Place a dog by hand
        </h3>
        <Button type="button" variant="ghost" size="touch" onClick={onDone}>
          Done
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Armband and Random sort the dogs still waiting again and replace anything placed here.
      </p>
      {isError ? (
        <div
          role="alert"
          className="mt-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <span className="text-destructive">Couldn&rsquo;t load the run order.</span>
          <Button type="button" variant="outline" size="touch" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : !placement ? (
        // No data yet (loading, paused or disabled) is not an empty class.
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          Loading the run order…
        </p>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              {sections && sections.inRing.length + sections.completed.length > 0
                ? 'No dogs are waiting to run.'
                : 'No dogs on the run order yet.'}
            </p>
          ) : (
            <ol className="mt-2 divide-y rounded-md border" aria-label="Run order">
              {rows.map(row => (
                <HandPlacementRowItem
                  key={row.id}
                  row={row}
                  classId={classId}
                  runOrder={runOrder}
                />
              ))}
            </ol>
          )}
          <ReadOnlySection title="In the ring" rows={sections?.inRing ?? []} />
          <ReadOnlySection title="Completed" rows={sections?.completed ?? []} />
        </>
      )}
    </section>
  );
}
