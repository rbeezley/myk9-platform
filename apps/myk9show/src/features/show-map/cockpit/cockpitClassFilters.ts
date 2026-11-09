/**
 * The Show Desk schedule filter as one unit (MYK9-1785): Status (cockpitStatusFilter.ts), Judge,
 * Ring/area, Element and Level. Within a group a class shows when it matches ANY ticked value;
 * across groups it must match every group that has a tick. `matchesCockpitClassFilters` is the ONE
 * predicate: the schedule's rows, every option's count, and the "let the picked class go" rule all
 * call it, so the three cannot drift apart. Options come from the classes already in the snapshot.
 *
 * Judge options follow the selected day(s); the other groups read the whole show. A group with
 * fewer than two options is hidden, and a tick the show no longer offers (a stale link) is dropped
 * by `pruneCockpitFilters`, so a hidden or unknown tick can never empty the schedule unseen.
 */

import type { ListMultiOptionsFilterField } from '@/components/list-toolkit/types';
import { matchesAnyCockpitStatus } from './secretaryCockpitAttention';
import type {
  CockpitClassFilters,
  CockpitFilterFacts,
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

/** The value a class with no judge carries; no real id or name starts with `~`. */
export const UNASSIGNED_JUDGE = '~unassigned';

type ValueGroup = 'judges' | 'areas' | 'elements' | 'levels';

const GROUPS: readonly { group: ValueGroup; key: string; label: string }[] = [
  { group: 'judges', key: 'judge', label: 'Judge' },
  { group: 'areas', key: 'area', label: 'Ring/area' },
  { group: 'elements', key: 'element', label: 'Element' },
  { group: 'levels', key: 'level', label: 'Level' },
];

/** Values may hold a comma ("Smith, Jane"), so a comma and a percent sign are escaped. */
const escapeValue = (value: string) => value.replace(/%/g, '%25').replace(/,/g, '%2C');
const unescapeValue = (value: string) => value.replace(/%2C/g, ',').replace(/%25/g, '%');

/** Trimmed, de-duplicated, sorted values from a comma-list param. */
export function parseCockpitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map(part => unescapeValue(part.trim()))
    .filter(Boolean);
  return [...new Set(values)].sort();
}

/** The param value for these ticks, or null when the group is not filtering. */
export function serializeCockpitList(values: readonly string[] | undefined): string | null {
  const clean = [...new Set((values ?? []).filter(Boolean))].sort();
  return clean.length > 0 ? clean.map(escapeValue).join(',') : null;
}

export function filterFactsOf(cls: SecretaryCockpitClass): CockpitFilterFacts {
  const judgeValue = cls.judgeId || cls.judgeName || null;
  return {
    lifecycle: cls.lifecycle ?? null,
    closeout: cls.closeout ?? 'none',
    judge: judgeValue
      ? { value: judgeValue, label: cls.judgeName || 'Assigned judge' }
      : { value: UNASSIGNED_JUDGE, label: 'Unassigned' },
    areaLabels: cls.operationalArea?.labels ?? [],
    element: cls.element || null,
    level: cls.level || null,
  };
}

export function hasActiveCockpitFilters(filters: CockpitClassFilters): boolean {
  return (
    (filters.statuses?.length ?? 0) > 0 ||
    GROUPS.some(({ group }) => (filters[group]?.length ?? 0) > 0)
  );
}

const anyPicked = (picked: readonly string[] | undefined, values: readonly (string | null)[]) =>
  !picked || picked.length === 0 || values.some(value => value !== null && picked.includes(value));

/** Whether a class shows: ANY within a group, AND across groups. */
export function matchesCockpitClassFilters(
  facts: CockpitFilterFacts,
  filters: CockpitClassFilters,
  attentionCount: number
): boolean {
  return (
    matchesAnyCockpitStatus(facts, filters.statuses ?? [], attentionCount) &&
    anyPicked(filters.judges, [facts.judge.value]) &&
    anyPicked(filters.areas, facts.areaLabels) &&
    anyPicked(filters.elements, [facts.element]) &&
    anyPicked(filters.levels, [facts.level])
  );
}

export interface CockpitFilterOption {
  value: string;
  label: string;
}

type OptionMap = Map<string, { label: string; order: number }>;

function add(map: OptionMap, value: string | null, label: string, order: number) {
  if (!value) return;
  const known = map.get(value);
  if (!known) map.set(value, { label, order });
  else known.order = Math.min(known.order, order);
}

function sorted(map: OptionMap, byOrder: boolean): CockpitFilterOption[] {
  return [...map.entries()]
    .sort(
      ([, a], [, b]) =>
        (byOrder ? a.order - b.order : 0) ||
        a.label.localeCompare(b.label, undefined, { numeric: true })
    )
    .map(([value, { label }]) => ({ value, label }));
}

/**
 * Each group's options from the snapshot's classes; judges only over the selected day(s). A group
 * with fewer than two options comes back empty: the field is hidden and its ticks are dropped.
 */
export function cockpitFilterOptions(
  snapshot: Pick<SecretaryCockpitSnapshot, 'trials' | 'classes'>,
  selectedDays: readonly string[] | undefined
): Record<ValueGroup, CockpitFilterOption[]> {
  const dates = new Set(snapshot.trials.map(trial => trial.date));
  const days = (selectedDays ?? []).filter(day => dates.has(day));
  const inScope = new Set(
    snapshot.trials.filter(trial => days.length === 0 || days.includes(trial.date)).map(t => t.id)
  );
  const maps: Record<ValueGroup, OptionMap> = {
    judges: new Map(),
    areas: new Map(),
    elements: new Map(),
    levels: new Map(),
  };
  for (const cls of snapshot.classes) {
    const facts = filterFactsOf(cls);
    if (inScope.has(cls.trialId)) add(maps.judges, facts.judge.value, facts.judge.label, 0);
    for (const label of facts.areaLabels) add(maps.areas, label, label, 0);
    add(maps.elements, facts.element, facts.element ?? '', cls.classOrder);
    add(maps.levels, facts.level, facts.level ?? '', cls.classOrder);
  }
  const unassigned = maps.judges.get(UNASSIGNED_JUDGE);
  maps.judges.delete(UNASSIGNED_JUDGE);
  const judges = sorted(maps.judges, false);
  if (unassigned) judges.push({ value: UNASSIGNED_JUDGE, label: unassigned.label });
  const options = {
    judges,
    areas: sorted(maps.areas, false),
    elements: sorted(maps.elements, true),
    levels: sorted(maps.levels, true),
  };
  return Object.fromEntries(
    GROUPS.map(({ group }) => [group, options[group].length >= 2 ? options[group] : []])
  ) as Record<ValueGroup, CockpitFilterOption[]>;
}

/** The URL state with ticks the show does not offer (stale links, hidden groups) removed. */
export function pruneCockpitFilters<T extends CockpitClassFilters>(
  snapshot: Pick<SecretaryCockpitSnapshot, 'trials' | 'classes'>,
  state: T
): T {
  const options = cockpitFilterOptions(
    snapshot,
    (state as { selectedDays?: string[] }).selectedDays
  );
  let next = state;
  for (const { group } of GROUPS) {
    const known = new Set(options[group].map(option => option.value));
    const ticked = state[group] ?? [];
    const kept = ticked.filter(value => known.has(value));
    if (kept.length !== ticked.length) next = { ...next, [group]: kept };
  }
  return next;
}

/** The Judge, Ring/area, Element and Level fields, each hidden when it offers fewer than two. */
export function buildCockpitClassFilterFields({
  snapshot,
  model,
  filters,
  onChange,
}: {
  snapshot: Pick<SecretaryCockpitSnapshot, 'trials' | 'classes'>;
  model: SecretaryCockpitModel;
  filters: CockpitClassFilters;
  onChange: (update: CockpitClassFilters) => void;
}): ListMultiOptionsFilterField[] {
  const options = cockpitFilterOptions(snapshot, model.day.days);
  return GROUPS.filter(({ group }) => options[group].length > 0).map(({ group, key, label }) => ({
    kind: 'multiOptions',
    key,
    label,
    options: options[group].map(option => ({
      ...option,
      count: model.daySchedule.filter(row =>
        matchesCockpitClassFilters(row.filterFacts, { [group]: [option.value] }, row.attentionCount)
      ).length,
    })),
    values: [...(filters[group] ?? [])],
    onChange: values => onChange({ [group]: [...new Set(values)].sort() }),
  }));
}
