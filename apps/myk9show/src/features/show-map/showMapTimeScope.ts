import type {
  ShowMapCompletionScope,
  ShowMapDayScope,
  ShowMapNode,
  ShowMapScopeState,
  ShowMapTree,
} from './showMapTypes';

export type ShowMapDayBucket = 'today' | 'tomorrow' | 'other' | 'unscheduled';

export const DEFAULT_SHOW_MAP_SCOPE: ShowMapScopeState = {
  dayScope: 'all',
  completionScope: 'active',
};

const DEFAULT_TIMEZONE = 'America/New_York';

function dateKeyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function trialDateForNode(tree: ShowMapTree, node: ShowMapNode): string | undefined {
  if (node.trialDate) return node.trialDate;
  let parentId = node.parentId;
  while (parentId) {
    const parent = tree.nodesById[parentId];
    if (!parent) return undefined;
    if (parent.trialDate) return parent.trialDate;
    parentId = parent.parentId;
  }
  return undefined;
}

function timezoneForNode(tree: ShowMapTree, node: ShowMapNode): string {
  if (node.timezone) return node.timezone;
  let parentId = node.parentId;
  while (parentId) {
    const parent = tree.nodesById[parentId];
    if (!parent) break;
    if (parent.timezone) return parent.timezone;
    parentId = parent.parentId;
  }
  return DEFAULT_TIMEZONE;
}

export function getNodeDayBucket(
  tree: ShowMapTree,
  node: ShowMapNode,
  now: Date = new Date()
): ShowMapDayBucket {
  const trialDate = trialDateForNode(tree, node);
  if (!trialDate) return 'unscheduled';
  const dateKey = trialDate.slice(0, 10);
  const timezone = timezoneForNode(tree, node);
  const today = dateKeyInTimeZone(now, timezone);
  if (dateKey === today) return 'today';
  if (dateKey === addDays(today, 1)) return 'tomorrow';
  return 'other';
}

export function isNodeScheduledAfter(
  tree: ShowMapTree,
  node: ShowMapNode,
  now: Date = new Date()
): boolean {
  const trialDate = trialDateForNode(tree, node);
  if (!trialDate) return false;
  const timezone = timezoneForNode(tree, node);
  return trialDate.slice(0, 10) > dateKeyInTimeZone(now, timezone);
}

export function nodeMatchesDayScope(
  tree: ShowMapTree,
  node: ShowMapNode,
  dayScope: ShowMapDayScope,
  now: Date = new Date()
): boolean {
  if (dayScope === 'all' || node.type === 'show') return true;
  return getNodeDayBucket(tree, node, now) === dayScope;
}

export function isNodeComplete(node: ShowMapNode): boolean {
  return node.status?.kind === 'complete' || node.checkInStatus?.value === 'completed';
}

export function nodeMatchesCompletionScope(
  node: ShowMapNode,
  completionScope: ShowMapCompletionScope
): boolean {
  if (node.type === 'show') return true;
  const complete = isNodeComplete(node);
  return completionScope === 'completed' ? complete : !complete;
}

export function isDimmedByDayScope(
  tree: ShowMapTree,
  node: ShowMapNode,
  scope: ShowMapScopeState,
  now: Date = new Date()
): boolean {
  if (scope.dayScope !== 'all' || node.type === 'show') return false;
  const bucket = getNodeDayBucket(tree, node, now);
  return bucket !== 'today' && bucket !== 'unscheduled';
}
