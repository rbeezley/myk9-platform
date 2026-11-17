import { PlacementPill } from '@/components/base/PlacementPill';
import { formatRunFaults } from '@/features/_shared/runResultFacts';
import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';

/**
 * One compact result cell: "Q  0 faults  1:01.23  Element 0:30.10  1st". Time, faults and element
 * time show only for a dog that ran; the placement is the stored, server-calculated one and shows
 * only once it exists. The facts wrap, so the cell never widens the table in the compact panel.
 */
export function ClassEntryResultCell({ entry }: { entry: SecretaryCockpitClassEntry }) {
  const facts = entry.runFacts;
  if (!entry.result) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5" data-testid="class-entry-result">
      <span className="font-medium">{entry.result}</span>
      {facts?.ran && (
        <span className="text-xs text-muted-foreground">{formatRunFaults(facts.faults)}</span>
      )}
      {facts?.ran && facts.timeStr && (
        <span className="font-mono text-xs font-bold text-foreground">{facts.timeStr}</span>
      )}
      {facts?.ran && facts.elementTimeStr && (
        <span className="font-mono text-xs text-muted-foreground">
          Element {facts.elementTimeStr}
        </span>
      )}
      {facts?.placement != null && <PlacementPill placement={facts.placement} size="sm" />}
    </div>
  );
}
