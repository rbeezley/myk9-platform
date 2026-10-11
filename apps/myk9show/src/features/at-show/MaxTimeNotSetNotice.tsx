/**
 * Ringside notice for a class with no max search time saved.
 *
 * AKC sets some times by rule and leaves others to the judge (Interior, Exterior,
 * Detective, Handler Discrimination above Novice). A judge-set class without a
 * time used to auto-stop at an invented 3:00; now the timer runs without a limit
 * and the judge is told so (owner decision, 2026-10-10).
 */

import { AlertCircle } from 'lucide-react';
import { badgeClass } from './slots/atShowChrome.helpers';

/**
 * The live sheets whose timer takes the CLASS's max time. FastCat and UKC Rally
 * carry their own fixed limits and Obedience has none, so a missing class time
 * means nothing there and the notice would be false.
 */
const SHEETS_USING_CLASS_MAX_TIME = new Set([
  'AKC_SCENT_WORK',
  'AKC_SCENT_WORK_NATIONAL',
  'ASCA_SCENT_DETECTION',
  'UKC_NOSEWORK',
]);

export function MaxTimeNotSetNotice({
  maxTimeSeconds,
  registryKey,
}: {
  maxTimeSeconds: number;
  registryKey: string | null;
}) {
  if (maxTimeSeconds > 0 || !registryKey || !SHEETS_USING_CLASS_MAX_TIME.has(registryKey)) {
    return null;
  }
  return (
    <div
      role="note"
      className={`mx-auto flex max-w-2xl items-start gap-2 px-4 py-2 text-sm ${badgeClass('warning')}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        No max time is set for this class, so the timer won&apos;t stop on its own. Ask the
        secretary to set this class&apos;s Time Limit.
      </span>
    </div>
  );
}
