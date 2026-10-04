import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ShowMapRunOrderMenu } from '../ShowMapRunOrderMenu';
import { formatTime } from '@/lib/format/dates';
import { countLabel } from '@/utils/pluralize';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassChecklistSection } from './ClassChecklistSection';
import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';
import { AnnounceDelayButton } from './AnnounceDelayButton';
import type { ReactNode } from 'react';
import { RunOrderHandPlacement, RunOrderUndoNotice } from './RunOrderHandPlacement';
import { getStartDelayMinutes, scheduledClockValue } from './cockpitTime';
import { formatTrialIdentity } from './secretaryCockpitModel';
import type {
  FocusedClassModel,
  SecretaryCockpitAttention,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

export function SecretaryCockpitFocusedClass({
  showId,
  focused,
  sourceClass,
  trial,
  attention,
  timeZone,
  canManageShow,
  onCommand,
  runOrder,
  setupActions,
}: {
  showId: string;
  focused: FocusedClassModel | null;
  sourceClass: SecretaryCockpitClass | null;
  trial: SecretaryCockpitTrial | null;
  attention: readonly SecretaryCockpitAttention[];
  timeZone: string;
  canManageShow: boolean;
  onCommand: (commandId: string) => void;
  /** Run-order auto-sort for the focused class (F29b phase 2a). */
  runOrder?: SecretaryCockpitRunOrderControls | undefined;
  /** Edit class; the cockpit owns its dialogs (MYK9-956). */
  setupActions?: ReactNode;
}) {
  // Which class's hand-placement list is open; scoped by id so focusing another
  // class closes it rather than carrying it over.
  const [placingClassId, setPlacingClassId] = useState<string | null>(null);
  if (!focused || !sourceClass || !trial) {
    return (
      <aside className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Select a Class from the schedule to see its work and paperwork.
      </aside>
    );
  }

  const delayMinutes = getStartDelayMinutes({
    scheduledStart: sourceClass.scheduledStart ?? null,
    revisedExpectedStart: sourceClass.revisedExpectedStart ?? null,
    trialDate: trial.date,
    timeZone,
  });
  // With no scheduled start to compare against, a revised start still means
  // "running late"; the script opens with editable default minutes.
  const offerDelay =
    delayMinutes !== null ||
    (Boolean(sourceClass.revisedExpectedStart) &&
      !scheduledClockValue(sourceClass.scheduledStart ?? null));

  const entryCount = sourceClass.entryCount ?? null;
  // "2 of 2 scored" already says how many entries; the bare count is only the
  // fallback when progress is unknown (owner, 2026-10-03).
  // Same rule as the class card: before scoring can begin it would only read "0 of N".
  const progress = focused.progress.value;
  const scoringBegun =
    progress !== null &&
    (progress.completed > 0 ||
      focused.lifecycle.value === 'in-progress' ||
      focused.lifecycle.value === 'complete');
  const facts = [
    scoringBegun
      ? `${progress.completed} of ${progress.total} scored`
      : entryCount === null
        ? null
        : countLabel(entryCount, 'entry', 'entries'),
    focused.judgeName ? `Judge ${focused.judgeName}` : null,
  ].filter(Boolean);

  return (
    <aside className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm xl:sticky xl:top-[calc(var(--app-top-inset,3rem)+1rem)]">
      <div className="border-b p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Focused Class · {formatTrialIdentity(trial)}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{focused.name}</h2>
        {facts.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">{facts.join(' · ')}</p>
        )}
        {canManageShow && setupActions && <div className="mt-3">{setupActions}</div>}
      </div>

      <div className="space-y-5 p-5">
        {/* What the secretary SETS for this class, laid out as a form, apart from
            the work below it (owner, 2026-10-03). */}
        <section aria-labelledby="focused-class-settings" className="rounded-lg border bg-muted/30">
          <h3
            id="focused-class-settings"
            className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Class settings
          </h3>
          <dl className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="min-w-0">
              <ClassStatusControl
                classId={focused.id}
                lifecycle={focused.lifecycle.value}
                unenteredScoreCount={
                  focused.progress.value === null
                    ? 0
                    : Math.max(0, focused.progress.value.total - focused.progress.value.completed)
                }
                canManageShow={canManageShow}
              />
            </dd>
            <dt className="self-start pt-2 text-muted-foreground">Expected start</dt>
            <dd className="min-w-0 space-y-1">
              <ExpectedStartControl
                classId={focused.id}
                scheduledStart={sourceClass.scheduledStart ?? null}
                revisedExpectedStart={sourceClass.revisedExpectedStart ?? null}
                trialDate={trial.date}
                timeZone={timeZone}
                canManageShow={canManageShow}
              />
              {sourceClass.revisedExpectedStart && sourceClass.scheduledStart && (
                <div className="text-xs text-muted-foreground">
                  Scheduled {sourceClass.scheduledStart}
                </div>
              )}
              {canManageShow && sourceClass.lifecycle === 'not-started' && offerDelay && (
                <AnnounceDelayButton
                  showId={showId}
                  className={focused.name}
                  delayMinutes={delayMinutes ?? undefined}
                />
              )}
            </dd>
            <dt className="text-muted-foreground">Actual timing</dt>
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
            {/* F29b phase 2a: the run-order control's only home (the run sheet,
                Show Desk link and class setup were a three-hop dead end). Not
                gated on the move-up list below: auto-sort availability has nothing
                to do with which entries can move up. The menu hides itself
                below 2 entries. See docs/plan-f29b-operational-actions-home.md. */}
            {canManageShow && runOrder && (
              <>
                <dt className="text-muted-foreground">Run order</dt>
                <dd className="min-w-0">
                  <ShowMapRunOrderMenu
                    classId={focused.id}
                    classLabel={focused.name}
                    entryCount={
                      sourceClass.runListCount ?? sourceClass.entryCount ?? focused.entryRows.length
                    }
                    onAutoSort={runOrder.onAutoSort}
                    isAutoSorting={runOrder.isAutoSorting}
                    onEnterReorderMode={({ classId }) => setPlacingClassId(classId)}
                  />
                </dd>
              </>
            )}
          </dl>
        </section>

        {canManageShow && runOrder && (
          <RunOrderUndoNotice classId={focused.id} runOrder={runOrder} />
        )}
        {canManageShow && runOrder && placingClassId === focused.id && (
          <RunOrderHandPlacement
            showId={showId}
            classId={focused.id}
            runOrder={runOrder}
            onDone={() => setPlacingClassId(null)}
          />
        )}

        {attention.length > 0 && (
          <div className="space-y-2">
            {attention.map(item => (
              <div
                key={item.id}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-destructive">{item.label}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{item.reason}</div>
                  </div>
                </div>
                {item.destination && (
                  <CockpitActionLink
                    destination={item.destination}
                    onCommand={onCommand}
                    className="mt-3 w-full"
                  >
                    {item.label}
                  </CockpitActionLink>
                )}
              </div>
            ))}
          </div>
        )}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Class work
          </h3>
          {/* One column: two across clipped labels like "View entries and results". */}
          <div className="mt-2 grid gap-2">
            {focused.classWorkActions.map(action => (
              <CockpitActionLink
                key={action.id}
                destination={action.destination}
                onCommand={onCommand}
                variant="outline"
                className="w-full"
                operatorOnly={action.operatorOnly === true}
              >
                {action.label}
              </CockpitActionLink>
            ))}
          </div>
        </section>

        {canManageShow && focused.entryRows.length > 0 && (
          <section>
            {/* Only entries that can still move up -- not the class's full list,
                which is on "View entries and results". */}
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Can move up
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Entries that have not run, before the class starts.
            </p>
            {/* F29b: the only reachable home for these actions. `ShowMapRowActionsMenu`
                renders the same set, but mounts only inside the public Show Map, which
                is read-only by intent (#291) -- so a secretary-initiated move-up had no
                path at all. ShowDeskPanel already owns the dialog and the mutation;
                these buttons emit the commandId its runCommand resolves.
                See docs/plan-f29b-operational-actions-home.md. */}
            <ul className="mt-2 divide-y rounded-md border">
              {focused.entryRows.map(row => (
                <li key={row.nodeId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{row.label}</div>
                    {row.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">{row.subtitle}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {row.actions.map(action => (
                      <Button
                        key={action.commandId}
                        type="button"
                        variant="outline"
                        // Move up and Pull are irreversible show-day actions and
                        // the only route to them: never below the 44px floor.
                        size="touch"
                        title={action.why}
                        aria-label={`${action.label} — ${row.label}`}
                        onClick={() => onCommand(action.commandId)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ClassChecklistSection
          sourceClass={sourceClass}
          paperwork={focused.paperwork}
          timeZone={timeZone}
          onCommand={onCommand}
        />
      </div>
    </aside>
  );
}
