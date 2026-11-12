import type { ShowMapCompletionScope, ShowMapNode, ShowMapTree } from './showMapTypes';

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
