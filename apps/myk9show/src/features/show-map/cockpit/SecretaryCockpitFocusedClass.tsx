import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ShowMapRunOrderMenu } from '../ShowMapRunOrderMenu';
import { formatTime } from '@/lib/format/dates';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassChecklistSection } from './ClassChecklistSection';
import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';
import { AnnounceDelayButton } from './AnnounceDelayButton';
import type { ReactNode } from 'react';
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
  /** Edit class / Delete class; the cockpit owns their dialogs (MYK9-956). */
  setupActions?: ReactNode;
}) {
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

  return (
    <aside className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm xl:sticky xl:top-[calc(var(--app-top-inset,3rem)+1rem)]">
      <div className="border-b p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Focused Class · {formatTrialIdentity(trial)}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{focused.name}</h2>
            {canManageShow && setupActions && <div className="mt-2">{setupActions}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
              {focused.progress.value && (
                <span className="text-xs text-muted-foreground">
                  {focused.progress.value.completed} of {focused.progress.value.total} scored
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Expected start
            </div>
            <div className="mt-1">
              <ExpectedStartControl
                classId={focused.id}
                scheduledStart={sourceClass.scheduledStart ?? null}
                revisedExpectedStart={sourceClass.revisedExpectedStart ?? null}
                trialDate={trial.date}
                timeZone={timeZone}
                canManageShow={canManageShow}
              />
            </div>
            {sourceClass.revisedExpectedStart && sourceClass.scheduledStart && (
              <div className="mt-1 text-xs text-muted-foreground">
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
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actual timing
            </div>
            <div className="mt-1 font-medium">
              {focused.actualStart.value
                ? `Started ${formatTime(focused.actualStart.value, timeZone)}`
                : 'Not started'}
              {focused.actualFinish.value
                ? ` · Finished ${formatTime(focused.actualFinish.value, timeZone)}`
                : ''}
            </div>
          </div>
        </div>

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
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
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

        {/* F29b phase 2a: run order had a three-hop dead end -- the run sheet sends you
            to Show Desk, Show Desk's "Run order and class setup" link lands on class
            setup, and class setup has no run-order control. This is that control.
            It sits OUTSIDE the Entries section on purpose: that section is gated on
            `entryRows`, which is filtered by STRANDED_ENTRY_ACTION_IDS, and auto-sort
            availability has nothing to do with which actions are stranded. Nesting it
            there meant a class could have entries to sort and no menu to sort them.
            The menu hides itself below 2 entries. Manual drag reorder (2b) is still
            outstanding; see docs/plan-f29b-operational-actions-home.md. */}
        {canManageShow && runOrder && (
          <section className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Run order
            </h3>
            <ShowMapRunOrderMenu
              classId={focused.id}
              classLabel={focused.name}
              entryCount={sourceClass.entryCount ?? focused.entryRows.length}
              onAutoSort={runOrder.onAutoSort}
              isAutoSorting={runOrder.isAutoSorting}
            />
          </section>
        )}

        {canManageShow && focused.entryRows.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Entries
            </h3>
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
