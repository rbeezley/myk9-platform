import { useMemo, useState } from 'react';

import { useShowPaperworkPrints } from '@/features/show-map/cockpit/useShowPaperworkPrints';
import { formatJudgeDayDate } from '@/features/show-map/judgeDay';
import {
  DEFAULT_LABEL_CHOICE,
  choiceForEntry,
  dogKeyOf,
  entriesForChoice,
  labelKeyOf,
  lastLabelPrintedAt,
  listLabelDays,
  listLabelDogs,
  printedLabelKeys,
  type ArmbandLabelChoice,
} from '@/lib/labels/armbandLabelChoice';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';
import type { ReportScope } from '@/lib/reports/types';

function formatPrintedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * The panel's label choice (MYK9-2073): a day, one dog, "added since the last print". A dog's row
 * opens it preset to that entry's dog and day (`presetEntryId`); the secretary can still change it.
 */
export function useArmbandLabelChoice({
  showId,
  scope,
  entries,
  presetEntryId,
}: {
  showId: string | undefined;
  scope: ReportScope;
  entries: readonly ArmbandLabelEntry[];
  presetEntryId: string | undefined;
}) {
  const [picked, setPicked] = useState<ArmbandLabelChoice | null>(null);
  const preset = useMemo(() => choiceForEntry(entries, presetEntryId), [entries, presetEntryId]);
  const choice = picked ?? preset ?? DEFAULT_LABEL_CHOICE;
  const { data: records } = useShowPaperworkPrints(showId ?? '');
  const printed = useMemo(() => printedLabelKeys(records ?? []), [records]);

  const days = useMemo(() => listLabelDays(entries), [entries]);
  // Dogs on offer: everyone the day (or scope) holds, whichever dog is chosen now.
  const dogs = useMemo(
    () => listLabelDogs(entriesForChoice(entries, scope, { day: choice.day, dogKey: null })),
    [entries, scope, choice.day]
  );
  const candidates = useMemo(
    () => entriesForChoice(entries, scope, choice),
    [entries, scope, choice]
  );

  const setChoice = (next: ArmbandLabelChoice) => {
    // A dog who is not entered on the newly chosen day would leave nothing to print.
    const pool = entriesForChoice(entries, scope, { day: next.day, dogKey: null });
    const keepDog = next.dogKey === null || pool.some(entry => dogKeyOf(entry) === next.dogKey);
    setPicked(keepDog ? next : { ...next, dogKey: null });
  };

  let note: string | null = null;
  if (choice.dogKey !== null && candidates.length > 0) {
    const last = lastLabelPrintedAt(records ?? [], labelKeyOf(candidates[0]!));
    note = last
      ? `This label was last printed ${formatPrintedAt(last)}.`
      : 'This label has not been printed yet.';
  } else if (choice.addedOnly && candidates.length > 0) {
    const anyPrinted = candidates.some(entry => printed.has(labelKeyOf(entry)));
    note = anyPrinted
      ? choice.day
        ? `Labels already printed for ${formatJudgeDayDate(choice.day)} are left out.`
        : 'Labels already printed are left out.'
      : 'No labels have been printed for this choice yet, so all of them are included.';
  }

  return { choice, setChoice, days, dogs, candidates, printed, note };
}
