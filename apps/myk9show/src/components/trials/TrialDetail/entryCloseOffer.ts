import { toast } from 'sonner';
import { format } from 'date-fns';
import { replicatedShowsTable, replicatedTrialsTable } from '@/services/replication';
import { deriveShowDatesFromTrials } from '@/store/deriveShowDatesFromTrials';
import { toEntryCloseDay } from '@/features/payments/entryCloseDeadline';
import { toLocalDate } from '@/utils/date-format';

export interface EntryCloseOffer {
  /** The day before the show starts, as YYYY-MM-DD. */
  closeOn: string;
}

/** The calendar day before `day` (YYYY-MM-DD), by calendar arithmetic, never a local instant. */
function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * MYK9-2381: after a trial move, entries that close AFTER the show's first day are wrong
 * (the Edit Show form requires close on or before the start). Both sides are calendar days.
 * Returns the day to offer, or null when there is nothing to say: no close date, or close
 * already on or before the start day.
 */
export function entryCloseOffer(
  showStartDay: string | undefined,
  entryCloseDate: string | null | undefined
): EntryCloseOffer | null {
  const startDay = showStartDay?.slice(0, 10);
  const closeDay = toEntryCloseDay(entryCloseDate);
  if (!startDay || !closeDay || closeDay <= startDay) return null;
  return { closeOn: dayBefore(startDay) };
}

const dayLabel = (day: string) => format(toLocalDate(day), 'EEE, MMM d');

/**
 * After Edit Trial saves a moved day: if the show now starts before entries close, say so in a
 * toast with a one-tap "Close entries on ..." action. Never blocks the save, never moves the
 * date on its own. Best-effort: a read failure shows nothing.
 */
export async function offerEntryCloseAfterTrialMove(
  showId: string,
  updateShow: (id: string, updates: { entryCloseDate: string }) => Promise<unknown>
): Promise<void> {
  try {
    const derived = deriveShowDatesFromTrials(await replicatedTrialsTable.getTrialsByShow(showId));
    const show = await replicatedShowsTable.get(showId);
    const offer = entryCloseOffer(derived?.startDate, show?.entryCloseDate);
    if (!offer) return;
    toast('Entries now close after the show starts', {
      description: `The show starts ${dayLabel(derived!.startDate)}, but entries close ${dayLabel(
        toEntryCloseDay(show?.entryCloseDate)!
      )}.`,
      duration: 15000,
      action: {
        label: `Close entries on ${dayLabel(offer.closeOn)}`,
        onClick: async () => {
          try {
            await updateShow(showId, { entryCloseDate: offer.closeOn });
            toast.success(`Entries now close on ${dayLabel(offer.closeOn)}.`);
          } catch {
            toast.error('Entry close could not be changed. Try again.');
          }
        },
      },
    });
  } catch {
    /* best-effort: the trial move already saved */
  }
}
