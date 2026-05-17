import { nodeMatchesDayScope } from './showMapTimeScope';
import type { ShowMapScopeState, ShowMapTree } from './showMapTypes';

export interface ShowMapRunningNowItem {
  nodeId: string;
  label: string;
  ringLabel: string;
  judgeName?: string | undefined;
  startTime?: string | undefined;
  progressLabel?: string | undefined;
  percentScored?: number | undefined;
}

function percentScored(completed: number, total: number): number | undefined {
  if (total <= 0) return undefined;
  return Math.round((completed / total) * 100);
}

function startTimeSortValue(startTime: string | undefined): number {
  if (!startTime) return Number.POSITIVE_INFINITY;
  const match = startTime.trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return Number.POSITIVE_INFINITY;
  const hour = Number(match[1] ?? Number.NaN);
  const minute = Number(match[2] ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.POSITIVE_INFINITY;
  return hour * 60 + minute;
}

export function getRunningNowItems(
  tree: ShowMapTree,
  scope: ShowMapScopeState,
  now: Date = new Date()
): ShowMapRunningNowItem[] {
  if (scope.completionScope !== 'active') return [];

  return Object.values(tree.nodesById)
    .filter(node => node.type === 'class')
    .filter(node => node.status?.kind === 'active')
    .filter(node => nodeMatchesDayScope(tree, node, scope.dayScope, now))
    .map(node => ({
      nodeId: node.id,
      label: node.label,
      ringLabel: node.ringLabel ?? 'Now',
      ...(node.judgeName ? { judgeName: node.judgeName } : {}),
      ...(node.startTime ? { startTime: node.startTime } : {}),
      ...(node.progress ? { progressLabel: node.progress.label } : {}),
      ...(node.progress
        ? { percentScored: percentScored(node.progress.completed, node.progress.total) }
        : {}),
    }))
    .sort((a, b) => {
      const start = startTimeSortValue(a.startTime) - startTimeSortValue(b.startTime);
      if (start !== 0) return start;
      return a.label.localeCompare(b.label);
    });
}
