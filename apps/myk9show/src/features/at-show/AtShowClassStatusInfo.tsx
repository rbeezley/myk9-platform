import { Clock3, WifiOff } from 'lucide-react';
import type { ClassEntry, EffectiveClassStatus } from '@myk9/ringside';
import { formatAtShowClassTime } from './atShowClassTiming';

/** MYK9-1513: Offline Scoring's orange badge with a WifiOff icon (v3 parity). */
export function OfflineScoringBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
      <WifiOff size={12} aria-hidden />
      Offline Scoring
    </span>
  );
}

/** The time a status carries: "Briefing 10:00 AM", "Break Until 10:30 AM", "Start Time 11:00 AM". */
function statusTimeLabel(entry: ClassEntry, status: EffectiveClassStatus): [string, string] | null {
  switch (status) {
    case 'briefing':
      return entry.briefing_time ? ['Briefing', entry.briefing_time] : null;
    case 'break':
      return entry.break_until ? ['Break Until', entry.break_until] : null;
    case 'start_time':
      return entry.start_time ? ['Start Time', entry.start_time] : null;
    default:
      return null;
  }
}

/** Whether the card's own status line replaces the generic "Scheduled / Expected" one. */
export function statusCarriesTime(entry: ClassEntry, status: EffectiveClassStatus): boolean {
  return statusTimeLabel(entry, status) !== null;
}

export function AtShowClassStatusInfo({
  entry,
  status,
  trialTimeZone,
}: {
  entry: ClassEntry;
  status: EffectiveClassStatus;
  trialTimeZone: string;
}) {
  const label = statusTimeLabel(entry, status);
  return (
    <>
      {label && (
        <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-foreground/80">
          <Clock3 size={13} className="shrink-0" aria-hidden />
          {label[0]} {formatAtShowClassTime(label[1], trialTimeZone)}
        </div>
      )}
      {status === 'offline-scoring' && (
        <div
          role="status"
          className="mt-1 flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning"
        >
          <WifiOff size={13} className="shrink-0" aria-hidden />
          Offline - updates when reconnected
        </div>
      )}
    </>
  );
}
