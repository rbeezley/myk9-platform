#!/usr/bin/env tsx
/**
 * Preflight: refuse the rehearsal when a per-show staff credential is missing.
 *
 * `assertStaffCredentialsComplete` already fails closed, but it runs inside
 * loadBrowserRunner — that is, in the SHARD job, after prepare has already
 * reseeded the shared target. A missing secret there costs the whole
 * operator-approved window: sixteen shards start, every one throws, and the
 * reseed has to be restored for nothing.
 *
 * Running the same check here, before the reseed, makes the module's promise
 * true: a missing credential costs a refused dispatch.
 *
 * Presence only. Scope is verified later, in the runner, because
 * `manageable_show_ids()` cannot be right until the reseed has granted each
 * account its club-level secretary role on its own load club — so the scope
 * assertion has nothing to read at this point in the job.
 */

import {
  assertStaffCredentialsComplete,
  resolveStaffCredentials,
} from '../src/test/load/loadStaffCredentials';

try {
  const resolved = resolveStaffCredentials(process.env);
  assertStaffCredentialsComplete(resolved);
  console.log(
    `Per-show staff credentials present for ${resolved.credentials.length} load show(s): ` +
      resolved.credentials.map(credential => credential.email).join(', ')
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
