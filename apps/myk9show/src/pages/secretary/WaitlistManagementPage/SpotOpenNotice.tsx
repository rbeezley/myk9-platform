import { ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClassSpotState } from '@/features/waiting-for-you';
import { formatMonthDay } from '@/lib/format/dates';
import { waitlistDogName } from './spotEntry';
import type { WaitlistEntry } from './types';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

interface SpotOpenNoticeProps {
  spot: ClassSpotState;
  /** The row behind `spot.nextInLine`, from the class's whole queue (a search never hides it). */
  nextEntry: WaitlistEntry | null;
  /** The show's automatic-offer setting: only an explicit false recommends a dog. */
  autoOffer: boolean | null;
  offline: boolean;
  onOffer: (entry: WaitlistEntry) => void;
}

/**
 * Says whether a spot is open in this class and, if not, which limit is in the way. A spot is open
 * only when the class's own limit AND the judge's day both have room. Offering stays a person's
 * action: the notice names who is next in line and offers one main button for them. Offers are
 * online-only, so the button is disabled offline.
 */
export function SpotOpenNotice({
  spot,
  nextEntry,
  autoOffer,
  offline,
  onOffer,
}: SpotOpenNoticeProps) {
  const held = spot.openOffers.length;
  const offered = `${held} offered, waiting for payment`;

  let text: string | null = null;
  if (spot.reason === 'open') {
    const open = `${spot.spotsOpen} ${plural(spot.spotsOpen, 'spot', 'spots')} open`;
    const joined = nextEntry?.created_at ? ` (joined ${formatMonthDay(nextEntry.created_at)})` : '';
    text = [
      held > 0 ? `${open} · ${offered}` : open,
      autoOffer === false && nextEntry
        ? ` Next in line: ${waitlistDogName(nextEntry)}${joined}`
        : '',
    ]
      .filter(Boolean)
      .join('.');
  } else if (spot.reason === 'offers-cover-spots') {
    text = `${held} ${plural(held, 'spot', 'spots')} open · ${offered} · none left to offer`;
  } else if (spot.reason === 'judge-day-unknown') {
    text = offline
      ? "You're offline, so open spots can't be checked against the judge's day. Offers need a connection."
      : "Open spots are checked against the judge's day, which could not be read just now.";
  } else {
    text = spot.explanation;
  }
  if (!text) return null;

  const showMain = spot.reason === 'open' && autoOffer === false && nextEntry;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
      role="status"
      data-testid="waitlist-spot-notice"
      data-reason={spot.reason}
    >
      <p>{text}</p>
      {showMain && (
        <Button disabled={offline} onClick={() => onOffer(nextEntry)}>
          <ArrowUpCircle className="h-4 w-4 mr-1" />
          Offer spot to {waitlistDogName(nextEntry)}
        </Button>
      )}
    </div>
  );
}
