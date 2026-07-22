import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { useSecretaryCockpitUrlState } from './useSecretaryCockpitUrlState';
import { CockpitActionLink } from './CockpitActionLink';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import { getCockpitAnchorElementId } from './cockpitRoutes';
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
  const [showAllAttention, setShowAllAttention] = useState(false);
  const restoredAnchor = useRef<string | null>(null);
  const isSplitViewport = useMediaQuery('(min-width: 1280px)');
  const model = buildSecretaryCockpitModel(snapshot, state);
  const focusedId = model.focusedClass?.id;
  const sourceClass = snapshot.classes.find(classItem => classItem.id === focusedId) ?? null;
  const trial = sourceClass
    ? (snapshot.trials.find(item => item.id === sourceClass.trialId) ?? null)
    : null;
  const focusedAttention = model.attention.all.filter(item => item.classId === focusedId);
  const focusedClassIsVisible = model.trialGroups.some(group =>
    group.classes.some(classItem => classItem.id === focusedId)
  );
  const focusedPanel = model.focusedClass ? (
    <SecretaryCockpitFocusedClass
      focused={model.focusedClass}
      sourceClass={sourceClass}
      trial={trial}
      attention={focusedAttention}
      timeZone={snapshot.timeZone}
      canManageShow={canManageShow}
      onCommand={onCommand}
    />
  ) : null;

  useEffect(() => {
    const updates: Parameters<typeof updateState>[0] = {};
    if (model.day.selected && state.selectedDay !== model.day.selected) {
      updates.selectedDay = model.day.selected;
    }
    if (focusedId && state.focusedClassId !== focusedId) {
      updates.focusedClassId = focusedId;
    }
    if (focusedId && !state.anchor) updates.anchor = focusedId;
    if (Object.keys(updates).length > 0) updateState(updates, { replace: true });
  }, [
    focusedId,
    model.day.selected,
    state.anchor,
    state.focusedClassId,
    state.selectedDay,
    updateState,
  ]);

  useEffect(() => {
    if (!state.anchor || restoredAnchor.current === state.anchor) return;
    const target = document.getElementById(getCockpitAnchorElementId(state.anchor));
    if (!target) return;
    restoredAnchor.current = state.anchor;
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [state.anchor, model.trialGroups]);

  const visibleAttention = showAllAttention ? model.attention.all : model.attention.items;

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
              className="min-h-11"
              onClick={() =>
                updateState({ selectedDay: day, focusedClassId: undefined, anchor: undefined })
              }
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
            {visibleAttention.map(item => (
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
          {model.attention.overflowCount > 0 && !showAllAttention && (
            <Button
              type="button"
              variant="link"
              className="mt-1 min-h-11 px-0"
              onClick={() => setShowAllAttention(true)}
            >
              View {model.attention.overflowCount} more issues
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
          onFocusClass={focusedClassId => updateState({ focusedClassId, anchor: focusedClassId })}
          onCommand={onCommand}
          inlineFocusedContent={
            !isSplitViewport && focusedClassIsVisible ? focusedPanel : undefined
          }
        />
        {!isSplitViewport && !focusedClassIsVisible && model.focusedClass && (
          <div
            className="space-y-2"
            data-testid="cockpit-inline-focus"
            aria-label="Focused Class outside current schedule filter"
          >
            <p className="text-sm text-muted-foreground">
              Focused Class is outside the current schedule filter.
            </p>
            {focusedPanel}
          </div>
        )}
        {isSplitViewport && model.focusedClass && (
          <div className="xl:col-start-2 xl:row-start-2" data-testid="cockpit-split-focus">
            {focusedPanel}
          </div>
        )}
      </div>
    </div>
  );
}
