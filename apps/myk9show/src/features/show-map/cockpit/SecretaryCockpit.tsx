import { AlertTriangle, CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatWeekdayMonthDay } from '@/lib/format/dates';

import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { useSecretaryCockpitUrlState } from './useSecretaryCockpitUrlState';
import { CockpitActionLink } from './CockpitActionLink';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import type { SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

export function SecretaryCockpit({
  snapshot,
  canManageShow,
  onCommand,
}: {
  snapshot: SecretaryCockpitSnapshot;
  canManageShow: boolean;
  onCommand: (commandId: string) => void;
}) {
  const { state, updateState } = useSecretaryCockpitUrlState();
  const model = buildSecretaryCockpitModel(snapshot, state);
  const focusedId = model.focusedClass?.id;
  const sourceClass = snapshot.classes.find(classItem => classItem.id === focusedId) ?? null;
  const trial = sourceClass
    ? (snapshot.trials.find(item => item.id === sourceClass.trialId) ?? null)
    : null;
  const focusedAttention = model.attention.all.filter(item => item.classId === focusedId);
  const focusedPanel = (
    <SecretaryCockpitFocusedClass
      focused={model.focusedClass}
      sourceClass={sourceClass}
      trial={trial}
      attention={focusedAttention}
      timeZone={snapshot.timeZone}
      canManageShow={canManageShow}
      onCommand={onCommand}
    />
  );

  return (
    <div className="space-y-5" data-testid="secretary-cockpit">
      {model.day.available.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Show day">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {model.day.available.map(day => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={model.day.selected === day ? 'default' : 'outline'}
              onClick={() => updateState({ selectedDay: day, focusedClassId: undefined })}
            >
              {formatWeekdayMonthDay(day)}
            </Button>
          ))}
        </div>
      )}

      {model.attention.items.length > 0 && (
        <section aria-labelledby="cockpit-attention-title">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 id="cockpit-attention-title" className="text-sm font-semibold">
              Needs attention · {model.attention.all.length}
            </h2>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {model.attention.items.map(item => (
              <div
                key={item.id}
                className="rounded-lg border border-destructive/25 bg-destructive/5 p-3"
              >
                <div className="font-medium">{item.label}</div>
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.reason}</div>
                {item.destination && (
                  <CockpitActionLink
                    destination={item.destination}
                    onCommand={onCommand}
                    variant="ghost"
                    className="mt-2 h-8 w-full px-2 text-destructive hover:text-destructive"
                  >
                    Open
                  </CockpitActionLink>
                )}
              </div>
            ))}
          </div>
          {model.attention.overflowCount > 0 && (
            <Button
              type="button"
              variant="link"
              className="mt-1 px-0"
              onClick={() => updateState({ filter: 'needs-attention' })}
            >
              View {model.attention.overflowCount} more in the schedule
            </Button>
          )}
        </section>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:grid-rows-[auto_auto] xl:gap-5">
        <SecretaryCockpitSchedule
          model={model}
          sourceClasses={snapshot.classes}
          sourceTrials={snapshot.trials}
          timeZone={snapshot.timeZone}
          filter={state.filter}
          canManageShow={canManageShow}
          onFilterChange={filter => updateState({ filter })}
          onFocusClass={focusedClassId => updateState({ focusedClassId })}
          onCommand={onCommand}
          inlineFocusedContent={focusedPanel}
        />
        <div className="hidden xl:col-start-2 xl:row-start-2 xl:block">{focusedPanel}</div>
      </div>
    </div>
  );
}
