import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { MaxTimeDialog } from '@/features/at-show/slots/classDialogs';
import { classTimeDisplay } from '@/features/at-show/slots/classRequirementsFromClass';
import { useMaxTimeRange } from '@/features/at-show/slots/maxTimeRule';
import { useLiveClasses } from '@/features/at-show/useLiveClasses';
import { usePerAreaMaxTimes } from '@/features/at-show/usePerAreaMaxTimes';
import { formatTimeLimitSeconds } from '@myk9/core';

/**
 * The class's time limit in Edit class (MYK9-2379): what Requirements shows, and Change, which
 * opens the same Max Time dialog Ringside uses. That dialog checks the class's own replicated
 * rule (range, areas, a rulebook-fixed time) and saves through the class replica, so it works
 * offline. A time the rule fixes shows with no Change.
 */
export function FocusedClassTimeLimit({
  classId,
  registryId,
}: {
  classId: string;
  registryId: string;
}) {
  const [open, setOpen] = useState(false);
  const live = useLiveClasses([classId]);
  const cls = live?.[0] ?? null;
  const range = useMaxTimeRange(classId);
  // Per-area only where the class's scoresheet times each area, as Ringside decides it.
  const lookup = usePerAreaMaxTimes(
    cls?.trialId ?? undefined,
    cls?.name ?? undefined,
    cls !== null
  );
  const perArea = lookup.status === 'ready' && lookup.perArea;
  const time = classTimeDisplay(cls, perArea, registryId);
  const known = typeof range === 'object' && range !== null ? range : null;
  const fixed = Boolean(known?.fixed);
  // The class's cached rule can be stale; the resolved rule's fixed time still applies.
  const shown =
    time.value === 'Not set' && known?.fixed ? formatTimeLimitSeconds(known.fixed) : time.value;
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <span className="font-medium">{live === null ? 'Loading…' : shown}</span>
      {!fixed && cls && lookup.status === 'ready' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 px-2.5"
          aria-label={`Change time limit of ${cls.name ?? 'this class'}`}
          onClick={() => setOpen(true)}
        >
          Change
        </Button>
      )}
      {cls && (
        <MaxTimeDialog
          isOpen={open}
          onClose={() => setOpen(false)}
          classData={{
            id: cls.id,
            element: cls.element ?? '',
            level: cls.level ?? '',
            class_name: cls.name ?? '',
            ...(cls.timeLimitSeconds != null && { time_limit_seconds: cls.timeLimitSeconds }),
            ...(cls.timeLimitArea2Seconds != null && {
              time_limit_area2_seconds: cls.timeLimitArea2Seconds,
            }),
            ...(cls.timeLimitArea3Seconds != null && {
              time_limit_area3_seconds: cls.timeLimitArea3Seconds,
            }),
            ...(cls.areaCount != null && { area_count: cls.areaCount }),
            per_area_times: perArea,
          }}
        />
      )}
    </div>
  );
}
