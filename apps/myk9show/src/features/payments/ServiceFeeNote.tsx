/**
 * The service fee, said once and early (MYK9-1963 phase 1): one line beside the
 * entry fee on the show page, before the exhibitor starts the wizard.
 *
 * The rate is never typed here. It is `usePlatformFeeRates`, the same read the
 * wizard's Payment step prices its breakdown with, so the show page and the
 * Payment step cannot quote different fees. Callers render it only when the
 * show takes online entries (`acceptsOnlineEntries`): the fee is a card-payment
 * fee, and a mail-in show has no card payment to attach it to.
 */
import { Link } from 'react-router-dom';
import { usePlatformFeeRates } from '@/hooks/queries/usePlatformFeeRates';
import { formatPlatformFeeLabel } from '@/store/cartStore.helpers';

interface ServiceFeeNoteProps {
  className?: string;
}

export function ServiceFeeNote({ className }: ServiceFeeNoteProps) {
  const label = formatPlatformFeeLabel(usePlatformFeeRates());
  // A club on a no-fee rate has nothing to disclose; "Plus a 0% service fee"
  // would only raise the question.
  if (label === '0%') return null;

  return (
    <span className={className}>
      Plus a {label} service fee when you pay online.{' '}
      <Link to="/fees" className="underline underline-offset-2">
        How our fees work
      </Link>
    </span>
  );
}
