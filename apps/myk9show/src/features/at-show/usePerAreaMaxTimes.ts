import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { scoresheetKeyForClass } from '@/pages/scoring/types';

const LOOKUP_FAILED_MESSAGE =
  "Couldn't check how this class is timed, so Set Max Time is unavailable.";

export type PerAreaLookup =
  { status: 'pending' | 'failed' } | { status: 'ready'; perArea: boolean };

/**
 * AKC Scent Work and ASCA time each area against its own max (same rule as the entry list). One
 * decision for Ringside's class card and Show Desk's Edit class, so they cannot disagree.
 */
export function usePerAreaMaxTimes(
  trialId: string | undefined,
  className: string | undefined,
  enabled: boolean,
  attempt = 0
): PerAreaLookup {
  const [result, setResult] = useState<({ key: string } & PerAreaLookup) | null>(null);
  const key = `${trialId ?? ''}|${className ?? ''}|${attempt}`;
  useEffect(() => {
    if (!enabled || !trialId || !className) return;
    let cancelled = false;
    scoresheetKeyForClass(trialId, className)
      .then(sheet => {
        if (!cancelled) {
          setResult({
            key,
            status: 'ready',
            perArea: sheet === 'AKC_SCENT_WORK' || sheet === 'ASCA_SCENT_DETECTION',
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ key, status: 'failed' });
        toast.error(LOOKUP_FAILED_MESSAGE);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, trialId, className, key]);
  return result?.key === key ? result : { status: 'pending' };
}
