import type {
  ArmbandLabelEntry,
  ArmbandLabelItem,
  LabelFilterConfig,
} from './armbandLabelTypes';
import type { ReportScope } from '@/lib/reports/types';

export function selectArmbandLabelEntries(
  entries: readonly ArmbandLabelEntry[],
  scope: ReportScope
): ArmbandLabelEntry[] {
  const scoped = entries.filter(entry => {
    if (scope.kind === 'class') return entry.classId === scope.classId;
    if (scope.kind === 'trial') return entry.trialId === scope.trialId;
    return true;
  });

  const selected = new Map<string, ArmbandLabelEntry>();
  for (const entry of scoped) {
    const dogKey = entry.dogId || `armband:${entry.armband}`;
    const dayKey = entry.calendarDay || entry.trialDate || entry.id;
    const key = `${dogKey}:${dayKey}`;
    if (!selected.has(key)) selected.set(key, entry);
  }
  return [...selected.values()];
}

export function filterEntries(
  entries: ArmbandLabelEntry[],
  filter: LabelFilterConfig
): ArmbandLabelEntry[] {
  let result = entries.filter((e) => {
    if (e.isDayOfShow && !filter.dayOfShowEntries) return false;
    if (!e.isDayOfShow && !filter.earlyEntries) return false;
    return true;
  });

  if (filter.specificArmband != null) {
    result = result.filter((e) => e.armband === filter.specificArmband);
  }

  return result;
}

export function prepareArmbandLabelItems(
  entries: ArmbandLabelEntry[]
): ArmbandLabelItem[] {
  return [...entries]
    .sort((a, b) => a.armband - b.armband)
    .map((e) => ({
      armband: e.armband,
      callName: e.callName,
      handler: e.handler,
      trialDate: e.trialDate,
    }));
}
