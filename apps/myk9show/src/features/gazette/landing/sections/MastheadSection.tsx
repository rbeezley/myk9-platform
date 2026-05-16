import { GazetteMasthead } from '../../components/GazetteMasthead';
import { formatMastheadDate } from '../utils/dateFormat';

interface MastheadSectionProps {
  clubName: string;
  volumeRoman: string;
  edition: number | null;
  motto: string;
  established: string | null;
  cityLabel: string | null;
  trialStartDate: string | null;
  timezone: string;
  /** Optional right-side sub-strip slot — typically the AKC license line. */
  licenseLabel?: string | null;
}

/**
 * The masthead section — Gazette's signature element. Builds the date label
 * from the trial start date in the trial's IANA timezone, then defers to the
 * shared <GazetteMasthead> primitive for layout.
 *
 * The auto-italicization of first/last word in clubName is handled inside
 * the primitive (see reconciliation notes Q4 for the rule).
 */
export function MastheadSection({
  clubName,
  volumeRoman,
  edition,
  motto,
  established,
  cityLabel,
  trialStartDate,
  timezone,
  licenseLabel,
}: MastheadSectionProps) {
  const dateLabel = formatMastheadDate(trialStartDate, timezone);

  return (
    <GazetteMasthead
      clubName={clubName}
      volumeRoman={volumeRoman}
      edition={edition}
      dateLabel={dateLabel}
      cityLabel={cityLabel}
      established={established}
      motto={motto}
      rightSubSlot={licenseLabel ?? null}
    />
  );
}
