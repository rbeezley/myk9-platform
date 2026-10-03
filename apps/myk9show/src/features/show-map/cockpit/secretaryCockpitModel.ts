import { formatTrialLabel } from '@myk9/core';
import type { RegistryId } from '@/features/registries';
import { buildAttentionCountByClass, matchesCockpitFilter } from './secretaryCockpitAttention';
import { ALL_DAYS } from './cockpitRoutes';
import {
  buildCockpitClassLabelResolver,
  compareCockpitClasses,
} from './secretaryCockpitClassLabel';
import type {
  CockpitAttentionKind,
  CockpitFilter,
  CockpitLifecycle,
  EvidenceKind,
  EvidenceValue,
  FocusedClassModel,
  OperationalAreaKind,
  ScheduledClassModel,
  SecretaryCockpitAction,
  SecretaryCockpitAttention,
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitPaperwork,
  SecretaryCockpitSnapshot,
  SecretaryCockpitState,
  SecretaryCockpitTrial,
  TrialScheduleGroupModel,
} from './secretaryCockpitTypes';
import {
  dateKeyInTimeZone,
  formatClock,
  formatTrialDate,
  minuteOfDayInTimeZone,
  operationalMinutes,
  parseTime,
} from './cockpitClock';
import { buildClassChecklist, summarizeClassChecklist } from './classChecklist';

const ATTENTION_LIMIT = 3;
export { ALL_DAYS } from './cockpitRoutes';
const PREPARATION_WINDOW_MINUTES = 30;
const PRE_CLASS_PAPERWORK = new Set(['check-in-sheet', 'scoresheet', 'armband-labels']);

const ATTENTION_PRIORITY: Record<CockpitAttentionKind, number> = {
  blocker: 0,
  'active-work': 1,
  preparation: 2,
  closeout: 3,
  administrative: 4,
};

/** Cockpit trial label: the trial's stored name (MYK9-704), never a prefixed number. */
export function formatTrialIdentity(trial: Pick<SecretaryCockpitTrial, 'name' | 'number'>): string {
  return formatTrialLabel({ name: trial.name, trialNumber: trial.number });
}

function sortedTrials(snapshot: SecretaryCockpitSnapshot): SecretaryCockpitTrial[] {
  return [...snapshot.trials].sort((a, b) => a.order - b.order || a.date.localeCompare(b.date));
}

/**
 * The day the cockpit opens on (owner, MYK9-953 decision 2): today on a show
 * day; the first show day before the show; the last show day after it. Between
 * two show days, the next one.
 */
function selectDay(snapshot: SecretaryCockpitSnapshot): string | null {
  const dates = [...new Set(snapshot.trials.map(trial => trial.date))].sort();
  if (dates.length === 0) return null;
  const today = dateKeyInTimeZone(snapshot.now, snapshot.timeZone);
  if (dates.includes(today)) return today;
  return dates.find(date => date > today) ?? dates[dates.length - 1]!;
}

function evidence<T>(value: T | null | undefined, kind: EvidenceKind): EvidenceValue<T> {
  return value == null ? { evidence: 'unknown', value: null } : { evidence: kind, value };
}

function lifecycleFor(cls: SecretaryCockpitClass): EvidenceValue<CockpitLifecycle> {
  return evidence(cls.lifecycle, 'recorded');
}

function progressFor(
  cls: SecretaryCockpitClass
): EvidenceValue<{ completed: number; total: number }> {
  if (cls.entryCount == null || cls.scoredCount == null)
    return { evidence: 'unknown', value: null };
  return {
    evidence: 'computed',
    value: { completed: cls.scoredCount, total: cls.entryCount },
  };
}

function operationalAreaFor(
  cls: SecretaryCockpitClass
): EvidenceValue<{ kind: OperationalAreaKind; label: string }> {
  const labels = cls.operationalArea?.labels.filter(Boolean) ?? [];
  return labels.length > 0 && cls.operationalArea
    ? {
        evidence: 'recorded',
        value: { kind: cls.operationalArea.kind, label: labels.join(' + ') },
      }
    : { evidence: 'unknown', value: null };
}

function primaryActionFor(cls: SecretaryCockpitClass): SecretaryCockpitAction | null {
  return (
    [...cls.actions]
      .filter(action => action.group === 'primary')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null
  );
}

function toScheduledClass(
  cls: SecretaryCockpitClass,
  label: string,
  timeZone: string,
  derivedAttentionCount = cls.attention.length
): ScheduledClassModel {
  const scheduledStart = cls.scheduledStart ?? null;
  return {
    id: cls.id,
    trialId: cls.trialId,
    name: label,
    timeLabel:
      formatClock(cls.revisedExpectedStart, timeZone) ??
      formatClock(scheduledStart, timeZone) ??
      'Time not set',
    scheduledStart,
    expectedStart: cls.revisedExpectedStart ?? scheduledStart,
    lifecycle: lifecycleFor(cls),
    progress: progressFor(cls),
    operationalArea: operationalAreaFor(cls),
    judgeName: cls.judgeName ?? null,
    attentionCount: derivedAttentionCount,
    closeout: cls.closeout ?? 'none',
    primaryAction: primaryActionFor(cls),
    checklist: checklistFor(cls),
  };
}

function checklistFor(cls: SecretaryCockpitClass): ScheduledClassModel['checklist'] {
  const items = buildClassChecklist({
    lifecycle: cls.lifecycle ?? null,
    entryCount: cls.entryCount ?? null,
    scoredCount: cls.scoredCount ?? null,
    wrapUpStatus: cls.wrapUpStatus ?? null,
    paperwork: cls.paperwork,
  });
  return items.length > 0 ? summarizeClassChecklist(items) : null;
}

function sortClasses(
  classes: readonly SecretaryCockpitClass[],
  registryId: RegistryId
): SecretaryCockpitClass[] {
  return [...classes].sort((a, b) =>
    compareCockpitClasses(a, b, cls => parseTime(cls.scheduledStart), registryId)
  );
}

function classesForTrials(
  snapshot: SecretaryCockpitSnapshot,
  trials: readonly SecretaryCockpitTrial[]
): SecretaryCockpitClass[] {
  return trials.flatMap(trial =>
    sortClasses(
      snapshot.classes.filter(cls => cls.trialId === trial.id),
      snapshot.registryId
    )
  );
}

function nowMarkerIndex(
  classes: readonly SecretaryCockpitClass[],
  trialDate: string,
  snapshot: SecretaryCockpitSnapshot
): number | null {
  // Quiet mode (MYK9-953 decision 3): only on the day that is actually today.
  if (trialDate !== dateKeyInTimeZone(snapshot.now, snapshot.timeZone)) return null;
  const nowMinutes = minuteOfDayInTimeZone(snapshot.now, snapshot.timeZone);
  const timed = classes.map(cls => parseTime(cls.scheduledStart));
  if (timed.every(value => value == null)) return null;
  const firstFutureIndex = timed.findIndex(value => value != null && value > nowMinutes);
  return firstFutureIndex < 0 ? classes.length : firstFutureIndex;
}

function validAttention(item: SecretaryCockpitAttention): boolean {
  if (!item.destination) return true;
  return item.destination.kind === 'command' || item.destination.href.startsWith('/');
}

function preparationAttention(
  cls: SecretaryCockpitClass,
  trial: SecretaryCockpitTrial,
  nowMinutes: number,
  allowUntimed: boolean,
  timeZone: string
): SecretaryCockpitAttention[] {
  if (cls.lifecycle !== 'not-started') return [];
  const expectedMinutes = operationalMinutes(
    cls.revisedExpectedStart ?? cls.scheduledStart,
    timeZone
  );
  const minutesUntil = expectedMinutes == null ? null : expectedMinutes - nowMinutes;
  const isImminent =
    minutesUntil != null && minutesUntil >= 0 && minutesUntil <= PREPARATION_WINDOW_MINUTES;
  if (!isImminent && !(expectedMinutes == null && allowUntimed)) return [];

  return cls.paperwork
    .filter(item => PRE_CLASS_PAPERWORK.has(item.reportId))
    .filter(item => item.state === 'unconfirmed' || item.state === 'unknown')
    .filter((item): item is SecretaryCockpitPaperwork & { printHref: string } =>
      Boolean(item.printHref?.startsWith('/'))
    )
    .map(item => ({
      id: `prepare:${cls.id}:${item.reportId}`,
      dedupeKey: `prepare:${cls.id}:${item.reportId}`,
      classId: cls.id,
      kind: 'preparation' as const,
      label: `Prepare ${item.label}`,
      // `unknown` means the print records could not be READ, so "not confirmed
      // printed" would be a claim about the world we cannot support. The chip
      // still belongs -- the secretary should look -- but it has to say which
      // situation it is in.
      reason: (() => {
        const status =
          item.state === 'unknown' ? 'print history unavailable' : 'not confirmed printed';
        return isImminent
          ? `${item.label} ${status} · starts in ${minutesUntil} minutes`
          : `${item.label} ${status} · next in schedule order for ${formatTrialIdentity(trial)}`;
      })(),
      destination: { kind: 'href' as const, href: item.printHref },
    }));
}

function buildAttention(
  snapshot: SecretaryCockpitSnapshot,
  scopeTrials: readonly SecretaryCockpitTrial[]
): SecretaryCockpitAttention[] {
  const trialById = new Map(scopeTrials.map(trial => [trial.id, trial]));
  const dayClasses = classesForTrials(snapshot, scopeTrials);
  // Quiet mode (MYK9-953 decision 3): "starts in N minutes" reminders only
  // for classes running today. A class at 8:50 tomorrow is not 20 minutes away
  // at 8:30 tonight.
  const today = dateKeyInTimeZone(snapshot.now, snapshot.timeZone);
  const todaysClasses = dayClasses.filter(cls => trialById.get(cls.trialId)?.date === today);
  const nextNotStarted = todaysClasses.find(cls => cls.lifecycle === 'not-started');
  const nowMinutes = minuteOfDayInTimeZone(snapshot.now, snapshot.timeZone);
  const generated = todaysClasses.flatMap(cls => {
    const trial = trialById.get(cls.trialId);
    return trial
      ? preparationAttention(
          cls,
          trial,
          nowMinutes,
          cls.id === nextNotStarted?.id,
          snapshot.timeZone
        )
      : [];
  });
  const candidates = [
    ...dayClasses.flatMap(cls =>
      cls.attention.map(item => ({ ...item, classId: item.classId ?? cls.id }))
    ),
    ...generated,
    ...(snapshot.administrativeAttention ?? []),
  ].filter(validAttention);

  const deduped = new Map<string, SecretaryCockpitAttention>();
  for (const item of candidates) {
    const key = item.dedupeKey ?? item.id;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return [...deduped.values()].sort((a, b) => {
    const priority = ATTENTION_PRIORITY[a.kind] - ATTENTION_PRIORITY[b.kind];
    if (priority !== 0) return priority;
    return a.id.localeCompare(b.id);
  });
}

function focusClass(
  classes: readonly SecretaryCockpitClass[],
  focusedClassId: string | undefined
): SecretaryCockpitClass | null {
  const explicit = focusedClassId ? classes.find(cls => cls.id === focusedClassId) : undefined;
  if (explicit) return explicit;
  return (
    classes.find(cls => cls.lifecycle === 'in-progress') ??
    classes.find(cls => cls.lifecycle === 'not-started') ??
    classes[0] ??
    null
  );
}

function paperworkEvidence(state: SecretaryCockpitPaperwork['state']): EvidenceKind {
  if (state === 'current' || state === 'stale') return 'staff-confirmed';
  return state === 'unknown' ? 'unknown' : 'computed';
}

function toFocusedClass(
  cls: SecretaryCockpitClass,
  label: string,
  timeZone: string,
  derivedAttentionCount: number
): FocusedClassModel {
  const scheduled = toScheduledClass(cls, label, timeZone, derivedAttentionCount);
  const actionsFor = (group: SecretaryCockpitAction['group']) =>
    cls.actions.filter(action => action.group === group);
  return {
    ...scheduled,
    actualStart: evidence(cls.actualStart, 'recorded'),
    actualFinish: evidence(cls.actualFinish, 'recorded'),
    paperwork: cls.paperwork.map(item => ({ ...item, evidence: paperworkEvidence(item.state) })),
    primaryActions: actionsFor('primary'),
    prepareActions: actionsFor('prepare'),
    finishActions: actionsFor('finish'),
    classWorkActions: actionsFor('class-work'),
    entryRows: cls.entryRows,
  };
}

function buildTrialGroups(
  snapshot: SecretaryCockpitSnapshot,
  openDay: string | null,
  focusedClassId: string | undefined,
  filter: CockpitFilter,
  scopeTrials: readonly SecretaryCockpitTrial[],
  attentionCountByClass: ReadonlyMap<string, number>,
  labelOf: (cls: SecretaryCockpitClass) => string
): TrialScheduleGroupModel[] {
  return scopeTrials
    .map(trial => {
      const allClasses = sortClasses(
        snapshot.classes.filter(cls => cls.trialId === trial.id),
        snapshot.registryId
      );
      const visibleClasses = allClasses.filter(cls =>
        matchesCockpitFilter(cls, filter, attentionCountByClass.get(cls.id) ?? 0)
      );
      return {
        trialId: trial.id,
        number: trial.number,
        date: trial.date,
        label: `${formatTrialIdentity(trial)} · ${formatTrialDate(trial.date)}`,
        classes: visibleClasses.map(cls =>
          toScheduledClass(
            cls,
            labelOf(cls),
            snapshot.timeZone,
            attentionCountByClass.get(cls.id) ?? 0
          )
        ),
        nowMarkerIndex: nowMarkerIndex(visibleClasses, trial.date, snapshot),
        // All days opens the default day's trials (owner, 2026-10-02); a
        // single chosen day opens every trial on it.
        defaultOpen:
          openDay === null ||
          trial.date === openDay ||
          allClasses.some(cls => cls.id === focusedClassId),
        summary: {
          classCount: allClasses.length,
          inProgressCount: allClasses.filter(cls => cls.lifecycle === 'in-progress').length,
          attentionCount: allClasses.reduce(
            (sum, cls) => sum + (attentionCountByClass.get(cls.id) ?? 0),
            0
          ),
          containsFocusedClass: allClasses.some(cls => cls.id === focusedClassId),
        },
      };
    })
    .filter(group => group.classes.length > 0 || filter === 'all');
}

export function buildSecretaryCockpitModel(
  snapshot: SecretaryCockpitSnapshot,
  state: SecretaryCockpitState
): SecretaryCockpitModel {
  const trials = sortedTrials(snapshot);
  const available = [...new Set(trials.map(trial => trial.date))].sort();
  const allDays = state.selectedDay === ALL_DAYS;
  const selectedDay =
    state.selectedDay && available.includes(state.selectedDay)
      ? state.selectedDay
      : selectDay(snapshot);
  const scopeTrials = allDays ? trials : trials.filter(trial => trial.date === selectedDay);
  const dayClasses = classesForTrials(snapshot, scopeTrials);
  const explicitFocus = state.focusedClassId
    ? dayClasses.find(cls => cls.id === state.focusedClassId)
    : undefined;
  // In All days, the default focus comes from the default day, not from a
  // stale in-progress class on another day.
  const focused =
    explicitFocus ??
    (allDays
      ? focusClass(
          classesForTrials(
            snapshot,
            trials.filter(trial => trial.date === selectedDay)
          ),
          undefined
        )
      : null) ??
    focusClass(dayClasses, undefined);
  const allAttention = buildAttention(snapshot, scopeTrials);
  const attentionCountByClass = buildAttentionCountByClass(allAttention);
  const labelOf = buildCockpitClassLabelResolver(snapshot.classes);

  return {
    day: {
      selected: selectedDay,
      allDays,
      available,
      isToday: selectedDay === dateKeyInTimeZone(snapshot.now, snapshot.timeZone),
    },
    attention: {
      items: allAttention.slice(0, ATTENTION_LIMIT),
      all: allAttention,
      overflowCount: Math.max(0, allAttention.length - ATTENTION_LIMIT),
    },
    // Every Class scheduled today, unfiltered by `state.filter` -- `trialGroups`
    // below is a `state.filter`-scoped slice of these same annotated rows. The
    // view-tab counts in `secretaryCockpitViews.ts` filter this array directly
    // with `matchesCockpitFilter`, so a tab's count can't diverge from what
    // the schedule renders (MYK9-812).
    daySchedule: dayClasses.map(cls =>
      toScheduledClass(cls, labelOf(cls), snapshot.timeZone, attentionCountByClass.get(cls.id) ?? 0)
    ),
    trialGroups: buildTrialGroups(
      snapshot,
      allDays ? selectedDay : null,
      focused?.id,
      state.filter,
      scopeTrials,
      attentionCountByClass,
      labelOf
    ),
    focusedClass: focused
      ? toFocusedClass(
          focused,
          labelOf(focused),
          snapshot.timeZone,
          allAttention.filter(item => item.classId === focused.id).length
        )
      : null,
  };
}
