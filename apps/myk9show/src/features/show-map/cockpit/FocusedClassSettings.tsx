import type { ReactNode } from 'react';

import { formatTime } from '@/lib/format/dates';
import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

/**
 * The focused class's settings card. Status and times are read-only facts here: changing them is
 * the class header's Actions menu (MYK9-1796). The Judge stays inline (MYK9-1323).
 */
export function FocusedClassSettings({
  focused,
  sourceClass,
  trial,
  timeZone,
  judgeControl,
}: {
  focused: FocusedClassModel;
  sourceClass: SecretaryCockpitClass;
  trial: SecretaryCockpitTrial;
  timeZone: string;
  judgeControl?: ReactNode;
}) {
  // What the secretary SETS for this class, laid out as a form, apart from the work below it
  // (owner, 2026-10-03).
  return (
    <section
      aria-labelledby="focused-class-settings"
      className="rounded-lg border bg-muted/30 [container-type:inline-size]"
    >
      <h3
        id="focused-class-settings"
        className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        Class settings
      </h3>
      {/* Label beside value only where the card has room for both; narrower (a phone, or the
          split's 360px focus column) each label sits above its value, so a control never runs
          past the card's edge (MYK9-1322). */}
      <dl className="grid grid-cols-1 items-center gap-x-4 gap-y-1 p-4 text-sm [@container(min-width:24rem)]:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] [@container(min-width:24rem)]:gap-y-3">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="min-w-0">
          <ClassStatusControl lifecycle={focused.lifecycle.value} />
        </dd>
        {judgeControl && (
          <>
            <dt className="mt-2 text-muted-foreground [@container(min-width:24rem)]:mt-0 [@container(min-width:24rem)]:self-start [@container(min-width:24rem)]:pt-2">
              Judge
            </dt>
            <dd className="min-w-0">{judgeControl}</dd>
          </>
        )}
        <dt className="mt-2 text-muted-foreground [@container(min-width:24rem)]:mt-0">
          Expected start
        </dt>
        <dd className="min-w-0 space-y-1">
          <ExpectedStartControl
            classId={focused.id}
            scheduledStart={sourceClass.scheduledStart ?? null}
            revisedExpectedStart={sourceClass.revisedExpectedStart ?? null}
            trialDate={trial.date}
            timeZone={timeZone}
            canManageShow={false}
          />
          {sourceClass.revisedExpectedStart && sourceClass.scheduledStart && (
            <div className="text-xs text-muted-foreground">
              Scheduled {sourceClass.scheduledStart}
            </div>
          )}
        </dd>
        <dt className="text-muted-foreground mt-2 [@container(min-width:24rem)]:mt-0">
          Actual timing
        </dt>
        <dd className="min-w-0 font-medium">
          {focused.actualStart.value
            ? `Started ${formatTime(focused.actualStart.value, timeZone)}`
            : // A class that ran without a recorded start must not claim it never started.
              sourceClass.lifecycle === 'not-started'
              ? 'Not started'
              : 'Start not recorded'}
          {focused.actualFinish.value
            ? ` · Finished ${formatTime(focused.actualFinish.value, timeZone)}`
            : ''}
        </dd>
      </dl>
    </section>
  );
}
