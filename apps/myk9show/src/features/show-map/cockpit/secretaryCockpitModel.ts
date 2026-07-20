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

const ATTENTION_LIMIT = 3;
const PREPARATION_WINDOW_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const PRE_CLASS_PAPERWORK = new Set(['check-in-sheet', 'scoresheet', 'armband-labels']);

const ATTENTION_PRIORITY: Record<CockpitAttentionKind, number> = {
  blocker: 0,
  'active-work': 1,
  preparation: 2,
  closeout: 3,
  administrative: 4,
};

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function minuteOfDayInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClock(value: string | null | undefined, timeZone: string): string | null {
  if (!value) return null;
  if (value.includes('T')) {
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
      })
        .format(instant)
        .replace(/\u202f/g, ' ');
    }
  }
  const minutes = parseTime(value);
  if (minutes == null) return value;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatTrialDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed);
}

export function formatTrialIdentity(number: string): string {
  const value = number.trim();
  if (!value) return 'Trial';
  return /^\d+[a-z]?$/i.test(value) ? `Trial ${value}` : value;
}

function sortedTrials(snapshot: SecretaryCockpitSnapshot): SecretaryCockpitTrial[] {
  return [...snapshot.trials].sort((a, b) => a.order - b.order || a.date.localeCompare(b.date));
}

function hasUnfinishedCloseout(
  date: string,
  snapshot: SecretaryCockpitSnapshot,
  trialById: ReadonlyMap<string, SecretaryCockpitTrial>
): boolean {
  return snapshot.classes.some(
    cls => trialById.get(cls.trialId)?.date === date && cls.closeout === 'needs-closeout'
  );
}

function selectDay(snapshot: SecretaryCockpitSnapshot): string | null {
  const trials = sortedTrials(snapshot);
  const dates = [...new Set(trials.map(trial => trial.date))].sort();
  if (dates.length === 0) return null;
  const today = dateKeyInTimeZone(snapshot.now, snapshot.timeZone);
  if (dates.includes(today)) return today;
  const future = dates.find(date => date > today);
  if (future) return future;
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  return (
    [...dates].reverse().find(date => hasUnfinishedCloseout(date, snapshot, trialById)) ??
    dates[dates.length - 1]!
  );
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
  timeZone: string,
  derivedAttentionCount = cls.attention.length
): ScheduledClassModel {
  const scheduledStart = cls.scheduledStart ?? null;
  return {
    id: cls.id,
    trialId: cls.trialId,
    name: cls.name,
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
  };
}

function sortClasses(classes: readonly SecretaryCockpitClass[]): SecretaryCockpitClass[] {
  return [...classes].sort((a, b) => {
    const aTime = parseTime(a.scheduledStart) ?? MINUTES_PER_DAY;
    const bTime = parseTime(b.scheduledStart) ?? MINUTES_PER_DAY;
    return aTime - bTime || a.classOrder - b.classOrder || a.name.localeCompare(b.name);
  });
}

function classesForDay(
  snapshot: SecretaryCockpitSnapshot,
  trials: readonly SecretaryCockpitTrial[],
  selectedDay: string | null
): SecretaryCockpitClass[] {
  return trials
    .filter(trial => trial.date === selectedDay)
    .flatMap(trial => sortClasses(snapshot.classes.filter(cls => cls.trialId === trial.id)));
}

function matchesFilter(
  cls: SecretaryCockpitClass,
  filter: CockpitFilter,
  derivedAttentionCount: number
): boolean {
  switch (filter) {
    case 'in-progress':
      return cls.lifecycle === 'in-progress';
    case 'needs-attention':
      return derivedAttentionCount > 0;
    case 'needs-closeout':
      return cls.closeout === 'needs-closeout';
    case 'all':
      return true;
  }
}

function nowMarkerIndex(
  classes: readonly SecretaryCockpitClass[],
  selectedDay: string | null,
  snapshot: SecretaryCockpitSnapshot
): number | null {
  if (!selectedDay || selectedDay !== dateKeyInTimeZone(snapshot.now, snapshot.timeZone))
    return null;
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
  allowUntimed: boolean
): SecretaryCockpitAttention[] {
  if (cls.lifecycle !== 'not-started') return [];
  const scheduledMinutes = parseTime(cls.scheduledStart);
  const minutesUntil = scheduledMinutes == null ? null : scheduledMinutes - nowMinutes;
  const isImminent =
    minutesUntil != null && minutesUntil >= 0 && minutesUntil <= PREPARATION_WINDOW_MINUTES;
  if (!isImminent && !(scheduledMinutes == null && allowUntimed)) return [];

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
      reason: isImminent
        ? `${item.label} not confirmed printed · starts in ${minutesUntil} minutes`
        : `${item.label} not confirmed printed · next in schedule order for Trial ${trial.number}`,
      destination: { kind: 'href' as const, href: item.printHref },
    }));
}

function buildAttention(
  snapshot: SecretaryCockpitSnapshot,
  selectedDay: string | null,
  trials: readonly SecretaryCockpitTrial[]
): SecretaryCockpitAttention[] {
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  const dayClasses = classesForDay(snapshot, trials, selectedDay);
  const nextNotStarted = dayClasses.find(cls => cls.lifecycle === 'not-started');
  const nowMinutes = minuteOfDayInTimeZone(snapshot.now, snapshot.timeZone);
  const generated = dayClasses.flatMap(cls => {
    const trial = trialById.get(cls.trialId);
    return trial ? preparationAttention(cls, trial, nowMinutes, cls.id === nextNotStarted?.id) : [];
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
  timeZone: string,
  derivedAttentionCount: number
): FocusedClassModel {
  const scheduled = toScheduledClass(cls, timeZone, derivedAttentionCount);
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
  };
}

function buildTrialGroups(
  snapshot: SecretaryCockpitSnapshot,
  selectedDay: string | null,
  focusedClassId: string | undefined,
  filter: CockpitFilter,
  trials: readonly SecretaryCockpitTrial[],
  attention: readonly SecretaryCockpitAttention[]
): TrialScheduleGroupModel[] {
  const attentionCountByClass = new Map<string, number>();
  for (const item of attention) {
    if (!item.classId) continue;
    attentionCountByClass.set(item.classId, (attentionCountByClass.get(item.classId) ?? 0) + 1);
  }
  return trials
    .filter(trial => trial.date === selectedDay)
    .map(trial => {
      const allClasses = sortClasses(snapshot.classes.filter(cls => cls.trialId === trial.id));
      const visibleClasses = allClasses.filter(cls =>
        matchesFilter(cls, filter, attentionCountByClass.get(cls.id) ?? 0)
      );
      return {
        trialId: trial.id,
        number: trial.number,
        date: trial.date,
        label: `${formatTrialIdentity(trial.number)} · ${formatTrialDate(trial.date)}`,
        classes: visibleClasses.map(cls =>
          toScheduledClass(cls, snapshot.timeZone, attentionCountByClass.get(cls.id) ?? 0)
        ),
        nowMarkerIndex: nowMarkerIndex(visibleClasses, selectedDay, snapshot),
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
  const selectedDay =
    state.selectedDay && available.includes(state.selectedDay)
      ? state.selectedDay
      : selectDay(snapshot);
  const dayClasses = classesForDay(snapshot, trials, selectedDay);
  const focused = focusClass(dayClasses, state.focusedClassId);
  const allAttention = buildAttention(snapshot, selectedDay, trials);

  return {
    day: {
      selected: selectedDay,
      available,
      isToday: selectedDay === dateKeyInTimeZone(snapshot.now, snapshot.timeZone),
    },
    attention: {
      items: allAttention.slice(0, ATTENTION_LIMIT),
      all: allAttention,
      overflowCount: Math.max(0, allAttention.length - ATTENTION_LIMIT),
    },
    trialGroups: buildTrialGroups(
      snapshot,
      selectedDay,
      focused?.id,
      state.filter,
      trials,
      allAttention
    ),
    focusedClass: focused
      ? toFocusedClass(
          focused,
          snapshot.timeZone,
          allAttention.filter(item => item.classId === focused.id).length
        )
      : null,
  };
}
