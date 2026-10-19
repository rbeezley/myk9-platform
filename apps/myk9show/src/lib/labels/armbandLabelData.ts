import type { ArmbandLabelEntry, ArmbandLabelItem, LabelFilterConfig } from './armbandLabelTypes';
import { armbandInSelection } from './armbandSelection';
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

  // A dog's entries may name different handlers, and the query has no order: pick by entry id
  // so the label (and its print fingerprint) does not change between fetches.
  const selected = new Map<string, ArmbandLabelEntry>();
  for (const entry of [...scoped].sort((a, b) => a.id.localeCompare(b.id))) {
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
  // Armbands typed by number are picked by number alone; the buckets below do not also have to
  // be ticked for them (MYK9-1233).
  const selection = filter.specificArmbands;
  if (selection != null) {
    return entries.filter(e => armbandInSelection(e.armband, selection));
  }

  // "Early" vs "Day of Show" is the REGISTRY bucket (`is_day_of_show`,
  // MYK9-642), reviewed for MYK9-677 and kept: it chooses which armbands to
  // print, not whose money is in the cash box, so a mail-in keyed after entries
  // closed prints with the day-of batch the registry counts it in. The
  // closeout card's "Entries made during the show" keys on submission time instead, and its
  // money comes from the payments ledger, not from entries.
  return entries.filter(e => {
    if (e.isDayOfShow && !filter.dayOfShowEntries) return false;
    if (!e.isDayOfShow && !filter.earlyEntries) return false;
    return true;
  });
}

export function prepareArmbandLabelItems(entries: ArmbandLabelEntry[]): ArmbandLabelItem[] {
  return [...entries]
    .sort((a, b) => a.armband - b.armband)
    .map(e => ({
      armband: e.armband,
      callName: e.callName,
      breed: e.breed,
      handler: e.handler,
      trialDate: e.trialDate,
    }));
}
