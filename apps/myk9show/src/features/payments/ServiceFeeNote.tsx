/**
 * The service fee, said once and early (MYK9-1963 phase 1): one line beside the
 * entry fee on the show page, before the exhibitor starts the wizard.
 *
 * The rate is never typed here. It is the live `platform_settings` read the
 * wizard's Payment step prices its breakdown with, so the show page and the
 * Payment step cannot quote different fees. The line appears only when that
 * read is `ready`: while it loads, offline, or after a failed read there is no
 * live rate, and the cart's fallback default quoted as fact would be wrong.
 *
 * It also appears only where an exhibitor could still enter online: the show
 * takes online entries (the fee is a card-payment fee) and its entry window is
 * open or opens later. A closed or window-less show has nothing to enter.
 */
import { Link } from 'react-router-dom';
import { usePlatformFeeRatesQuery } from '@/hooks/queries/usePlatformFeeRates';
import { formatPlatformFeeLabel } from '@/store/cartStore.helpers';
import { acceptsOnlineEntries } from '@/features/payments/onlineEntryGate';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import type { Show } from '@/types/show-types';

interface ServiceFeeNoteProps {
  show: Show;
  className?: string;
}

/** True while an exhibitor could still enter this show online (open, or opening later). */
function exhibitorCouldEnterOnline(show: Show): boolean {
  if (!acceptsOnlineEntries(show)) return false;
  const { status } = getEntryStatus(show);
  return status === 'accepting' || status === 'closing_soon' || status === 'not_yet_open';
}

/**
 * The note's label ("7%"), or null when the line must not show: the show offers
 * no online entry to attach a fee to, or the live rates are not read, or the
 * rate is zero (a club on a no-fee rate has nothing to disclose; "Plus a 0%
 * service fee" would only raise the question).
 */
export function useServiceFeeLabel(show: Show): string | null {
  const { rates, state } = usePlatformFeeRatesQuery();
  if (state !== 'ready' || !rates || !exhibitorCouldEnterOnline(show)) return null;
  const label = formatPlatformFeeLabel(rates);
  return label === '0%' ? null : label;
}

export function ServiceFeeNote({ show, className }: ServiceFeeNoteProps) {
  const label = useServiceFeeLabel(show);
  if (label === null) return null;

  return (
    <span className={className}>
      Plus a {label} service fee when you pay online.{' '}
      <Link to="/fees" className="underline underline-offset-2">
        How our fees work
      </Link>
    </span>
  );
}
