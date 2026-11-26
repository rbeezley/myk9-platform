import { getClassIds, groupSectionedClasses } from '@myk9/ringside';
import { toClassEntry } from '@/features/at-show/atShowClassListAdapter';
import {
  replicatedClassesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

/**
 * The other section of a class, with the combined card's name, the at-show lists show as one combined "A & B" card, or undefined.
 * It is the lists' own rule (`groupSectionedClasses`: organization, same judge, cancellation),
 * run over the class's trial, so a time set from Edit Class lands on the same classes as one set
 * from the entry list (MYK9-2405). Entry counts do not take part in pairing.
 */
export async function pairedClassOf(
  live: ReplicatedClass
): Promise<{ pairedClassId: string; className: string } | undefined> {
  if (!live.trialId) return undefined;
  const trial = await replicatedTrialsTable.getTrialById(live.trialId);
  const show = trial?.showId ? await replicatedShowsTable.getShowById(trial.showId) : null;
  const classes = await replicatedClassesTable.getClassesByTrial(live.trialId);
  const grouped = groupSectionedClasses(
    classes.map(cls => toClassEntry(cls, [], new Set())),
    show?.organization
  );
  const card = grouped.find(entry => getClassIds(entry).includes(live.id));
  const pairedClassId = card ? getClassIds(card).find(id => id !== live.id) : undefined;
  return card && pairedClassId ? { pairedClassId, className: card.class_name } : undefined;
}
