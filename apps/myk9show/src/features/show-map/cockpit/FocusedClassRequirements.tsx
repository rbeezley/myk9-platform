import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ClassRequirementsContent } from '@/features/at-show/slots/ClassRequirementsContent';
import { classTimeDisplay } from '@/features/at-show/slots/classRequirementsFromClass';
import { useLiveClasses } from '@/features/at-show/useLiveClasses';
import { formatTimeLimitSetAt } from './timeLimitSetAt';

/**
 * The focused class's Requirements and current time limit (MYK9-2118): the one-line row shows the
 * saved max time (per area where the class has areas); opening it shows the same cards Ringside's
 * Requirements dialog shows (`ClassRequirementsContent`). Read live from the class replica, so it
 * works offline. Setting the limit stays in Edit class and Ringside; this is the read.
 * When the limit was set (`timeLimitSetAt`, stamped by the server on any change to it, MYK9-2120)
 * follows it in the show's time zone; nothing extra shows for a class with no stamp.
 */
export function FocusedClassRequirements({
  classId,
  registryId,
  timeZone,
}: {
  classId: string;
  registryId: string;
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const live = useLiveClasses([classId]);
  const cls = live?.[0] ?? null;
  const perArea = (cls?.areaCount ?? 1) > 1;
  const time = classTimeDisplay(cls, perArea, registryId);
  const limit = live === null ? 'Loading…' : time.value;
  const setAt = !time.saved ? null : formatTimeLimitSetAt(cls?.timeLimitSetAt, timeZone);
  return (
    <section aria-label="Requirements" data-testid="focused-class-requirements">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Requirements
          </span>
          <span className="ml-3 font-medium">
            Time limit: {limit}
            {setAt && ` · ${setAt}`}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <div id={panelId} hidden={!open} className="pt-2">
        {open && (
          <ClassRequirementsContent
            cls={cls}
            loading={live === null}
            registry={registryId}
            perAreaTimes={perArea}
          />
        )}
      </div>
    </section>
  );
}
