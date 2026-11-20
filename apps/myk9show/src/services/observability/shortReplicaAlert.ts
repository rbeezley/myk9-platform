import * as Sentry from '@sentry/react';
import type { SyncResult } from '@myk9/replication';

/**
 * One Sentry event per table and scope while a download stays short of the
 * server's count (MYK9-2254). The sync engine is logger-free, so it hands the
 * facts back on the result and this reports them. The sync runs every minute
 * and a short device stays short, so the key is remembered until a later sync
 * of the same table and scope succeeds (whole again). In memory: a reload
 * reports once more, which is the safe direction.
 *
 * No banner and no toast: the offline line and the checklist already say an
 * offline copy is incomplete (docs/INTENT.md, "Offline Is Normal, Not Broken").
 */
const reported = new Set<string>();

const keyOf = (tableName: string, scope: string | undefined) =>
  JSON.stringify([tableName, scope ?? '']);

export function reportShortReplica(result: SyncResult, scope?: string): SyncResult {
  const short = result.shortReplica;
  if (!short) {
    if (result.success) reported.delete(keyOf(result.tableName, scope));
    return result;
  }
  const key = keyOf(short.tableName, short.scope);
  if (reported.has(key)) return result;
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
  return result;
}

export function resetShortReplicaReportsForTests(): void {
  reported.clear();
}
