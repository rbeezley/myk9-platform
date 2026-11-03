/**
 * External store over the replication package's stale-schema latch (MYK9-1663).
 *
 * `@myk9/replication` latches when this build is older than the device's
 * database (VersionError) or a newer build upgraded it under us. The latch
 * lives for the page, so the snapshot stays truthy across route changes.
 * Nothing here reloads: `StaleSchemaBanner` asks the person to.
 */

import { getStaleSchemaLatch, onStaleSchema, type StaleSchemaReason } from '@myk9/replication';

export function subscribeStaleSchema(onChange: () => void): () => void {
  return onStaleSchema(() => onChange());
}

export function getStaleSchemaSnapshot(): StaleSchemaReason | null {
  return getStaleSchemaLatch();
}
