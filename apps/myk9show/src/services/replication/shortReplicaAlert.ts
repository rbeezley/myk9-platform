import { configureShortReplicaObserver, type ShortReplica } from '@myk9/replication';
import { captureShortReplica } from '@/services/observability/sentry';

/**
 * MYK9-2254: the owner hears once per table and scope when a full download
 * stays short of the server's count. A device that stays short is silent on
 * every later pass until the scope comes back whole. Volunteers see nothing new:
 * the offline line and the readiness badge already report an incomplete show.
 * The memory is per session on purpose: a reload that is still short alerts
 * once more, which is cheap and proves the problem persists.
 */
const alerted = new Set<string>();
const keyOf = (table: string, scope: string | undefined) => `${table}\u0000${scope ?? ''}`;

export function reportShortReplica(info: ShortReplica): void {
  const key = keyOf(info.table, info.scope);
  if (alerted.has(key)) return;
  alerted.add(key);
  captureShortReplica(info);
}

export function clearShortReplica(table: string, scope: string | undefined): void {
  alerted.delete(keyOf(table, scope));
}

export function resetShortReplicaAlertsForTests(): void {
  alerted.clear();
}

configureShortReplicaObserver({ onShort: reportShortReplica, onWhole: clearShortReplica });
