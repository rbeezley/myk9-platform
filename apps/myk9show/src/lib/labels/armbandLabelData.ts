import type {
  ArmbandLabelEntry,
  ArmbandLabelItem,
  LabelFilterConfig,
} from './armbandLabelTypes';

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
