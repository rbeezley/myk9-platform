import { usePlatformFeeRatesQuery } from '@/hooks/queries/usePlatformFeeRates';
import { formatPlatformFeeLabel } from '@/store/cartStore.helpers';

/**
 * The live fee label ("7%"), or null until it has been read. The query hook, not the display
 * one: like /fees, the landing page states the fee publicly, so it never prints the
 * compiled-in fallback as if it had been read (MYK9-229).
 */
export function useLandingFeeLabel(): string | null {
  const { rates } = usePlatformFeeRatesQuery();
  return rates ? formatPlatformFeeLabel(rates) : null;
}
