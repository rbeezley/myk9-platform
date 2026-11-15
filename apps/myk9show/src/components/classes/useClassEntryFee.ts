import { useEntryWindowTimezone } from '@/hooks/useEntryWindowTimezone';
import { getClassFee } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers';

/** The show fields the class fee depends on. */
export interface ClassFeeShow {
  id: string;
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
  startDate: string;
  entryCloseDate?: string | undefined;
}

/**
 * What entering this class costs today, by the same rule registration charges
 * (`getShowEntryFee`: the class's own fee when it has one, plus the show's day-of
 * surcharge on the day (MYK9-1931); otherwise the day-of fee from the show's start
 * or after entries close, else the pre-entry fee).
 *
 * Reading `classes.entry_fee` directly showed $30 on a show charging $35 at the
 * gate (MYK9-724 F52), and shows nothing for a class without its own fee. Until
 * the show and its entry-window timezone are known, the class's own fee is the
 * only honest answer, as before.
 */
export function useClassEntryFee(
  parentShow: ClassFeeShow | undefined,
  classEntryFee: number | undefined
): number | undefined {
  const { timeZone, isReady } = useEntryWindowTimezone(parentShow?.id);
  if (!parentShow || !isReady) return classEntryFee;
  // A show with no fees set carries '' (unset, not free): fall back to the
  // class's own fee instead of letting the helper invent its $25 default.
  if (!parentShow.preEntryFee && !parentShow.dayOfShowFee) return classEntryFee;
  return getClassFee(
    {
      preEntryFee: parentShow.preEntryFee,
      dayOfShowFee: parentShow.dayOfShowFee,
      startDate: parentShow.startDate,
      entryCloseDate: parentShow.entryCloseDate,
      entryWindowTimezone: timeZone,
    },
    { entryFee: classEntryFee }
  );
}
