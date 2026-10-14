import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { getTrialTimezone } from '@/features/registries';
import { useOfflineReadiness } from '@/features/offline-readiness/useOfflineReadiness';
import { usePublishInfo } from '@/features/premium/usePublishInfo';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import type { ShowMapClassInput, ShowMapTrialInput } from '../showMapTypes';
import type { Show } from '@/types/show-types';

import {
  buildReadyForShowDay,
  isReadyForShowDayWindow,
  rollUpFirstDayPaperwork,
  type ReadyLine,
} from './readyForShowDay';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

interface ReadyForShowDaySectionProps {
  show: Show;
  trials: ShowMapTrialInput[];
  classes: ShowMapClassInput[];
  now: Date;
  entryBreakdownByClassId: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  paperwork: {
    byClassId: ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;
    available: boolean;
  };
}

const ICON_CLASS = 'mt-0.5 h-5 w-5 shrink-0';

function LineIcon({ status }: { status: ReadyLine['status'] }) {
  if (status === 'pass') {
    return <CheckCircle2 className={`${ICON_CLASS} text-success`} aria-hidden="true" />;
  }
  if (status === 'fail') {
    return <AlertTriangle className={`${ICON_CLASS} text-warning`} aria-hidden="true" />;
  }
  return <CircleHelp className={`${ICON_CLASS} text-muted-foreground`} aria-hidden="true" />;
}

function LineRow({ line }: { line: ReadyLine }) {
  const text = (
    <>
      <span className="font-medium">{line.label}</span>
      {line.detail && <span className="block text-muted-foreground">{line.detail}</span>}
    </>
  );
  return (
    <li className="flex items-start gap-3 text-sm">
      <LineIcon status={line.status} />
      <div>
        {line.status === 'fail' && line.href ? (
          <Link to={line.href} className="underline-offset-4 hover:underline">
            {text}
          </Link>
        ) : (
          text
        )}
      </div>
    </li>
  );
}

function ReadyForShowDayContent({
  show,
  trials,
  classes,
  entryBreakdownByClassId,
  paperwork,
}: Omit<ReadyForShowDaySectionProps, 'now'>) {
  const publishInfo = usePublishInfo(show.id, true);
  const { readiness } = useOfflineReadiness(show.id);

  const result = useMemo(() => {
    // Only a resolved, online read counts: a paused query keeps stale `data`, and a disabled or
    // placeholder one reads as empty -- neither is evidence the premium is published.
    const info =
      publishInfo.fetchStatus === 'paused' || publishInfo.isError ? undefined : publishInfo.data;
    return buildReadyForShowDay({
      setup: { show, trials, classes },
      premiumInfo: info
        ? {
            publishedPremiumUrl: info.publishedLocator || info.publishedPath,
            publishedPremiumAt: info.publishedAt,
            updatedAt: info.updatedAt,
            experienceIsPublished: info.experienceIsPublished,
          }
        : null,
      entryBreakdownByClassId,
      paperwork: rollUpFirstDayPaperwork({
        trials,
        classes,
        byClassId: paperwork.byClassId,
        available: paperwork.available,
      }),
      offline: readiness,
    });
  }, [
    classes,
    entryBreakdownByClassId,
    paperwork.available,
    paperwork.byClassId,
    publishInfo.data,
    publishInfo.fetchStatus,
    publishInfo.isError,
    readiness,
    show,
    trials,
  ]);

  if (result.allClear) {
    return (
      <section
        aria-label="Ready for show day"
        role="status"
        className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        Everything is handled.
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ready-for-show-day-title"
      className="space-y-3 rounded-xl border bg-card px-4 py-4"
    >
      <h2 id="ready-for-show-day-title" className="text-sm font-semibold">
        Ready for show day
      </h2>
      <ul className="space-y-3">
        {result.lines.map(line => (
          <LineRow key={line.id} line={line} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The night-before checklist (MYK9-1145): green ticks for what is handled, a link for what is
 * not. Manager-only and time-windowed, so the hooks live in the inner component and never run
 * outside the window.
 */
export function ReadyForShowDaySection({ now, ...rest }: ReadyForShowDaySectionProps) {
  const timeZone = getTrialTimezone(rest.trials[0]);
  if (!isReadyForShowDayWindow({ startDate: rest.show.startDate, now, timeZone })) return null;
  return <ReadyForShowDayContent {...rest} />;
}
