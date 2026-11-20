import * as Sentry from '@sentry/react';
import { setShortReplicaReporter, type ShortReplicaObservation } from '@myk9/replication';

/**
 * One Sentry event per table and scope while a download stays short of the
 * server's count (MYK9-2254). The sync engine is logger-free and calls ONE
 * reporter, registered once at startup, after every counted full sync, whoever
 * ran it. The sync runs every minute and a short device stays short, so a
 * (table, scope) is remembered until THAT table and scope completes whole,
 * which re-arms only it. In memory: a reload reports once more, which is the
 * safe direction.
 *
 * No banner and no toast: the offline line and the checklist already say an
 * offline copy is incomplete (docs/INTENT.md, "Offline Is Normal, Not Broken").
 */
const reported = new Set<string>();

const keyOf = (tableName: string, scope: string | undefined) =>
  JSON.stringify([tableName, scope ?? '']);

export function reportShortReplica({ tableName, scope, short }: ShortReplicaObservation): void {
  const key = keyOf(tableName, scope);
  if (!short) {
    reported.delete(key);
    return;
  }
  if (reported.has(key)) return;
  reported.add(key);
  Sentry.withScope(sentryScope => {
    sentryScope.setLevel('error');
    sentryScope.setTag('replication_table', short.tableName);
    sentryScope.setTag('replication_scope', short.scope ?? 'none');
    sentryScope.setFingerprint(['short-replica', short.tableName, short.scope ?? '']);
    sentryScope.setContext('short_replica', {
      table: short.tableName,
      scope: short.scope ?? null,
      serverCount: short.serverCount,
      deviceCount: short.deviceCount,
    });
    Sentry.captureMessage(
      `Offline copy is short: ${short.tableName} holds ${short.deviceCount} of ${short.serverCount} rows`
    );
  });
}

/** Called once where observability starts. */
export function registerShortReplicaReporter(): void {
  setShortReplicaReporter(reportShortReplica);
}

export function resetShortReplicaReportsForTests(): void {
  reported.clear();
}
