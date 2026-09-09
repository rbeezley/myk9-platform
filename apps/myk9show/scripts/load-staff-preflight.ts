#!/usr/bin/env tsx
/**
 * Before reseed, check secret presence without authentication. After reseed,
 * --verify-scope authenticates every secretary and checks isolation between the
 * load shows before allocating shards. The runner repeats the scope check to
 * catch changes between preparation and load. A post-reseed failure still runs
 * the workflow's mandatory restoration because its ownership marker is set.
 */
import {
  assertScopedToOwnShow,
  assertStaffCredentialsComplete,
  authenticateAndResolveScope,
  resolveStaffCredentials,
} from '../src/test/load/loadStaffCredentials';

async function main(): Promise<void> {
  const resolved = resolveStaffCredentials(process.env);
  assertStaffCredentialsComplete(resolved);
  if (process.argv.includes('--verify-scope')) {
    const url = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('Scope verification requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
    const authenticated = await Promise.all(
      resolved.credentials.map(credential => authenticateAndResolveScope(url, anonKey, credential))
    );
    assertScopedToOwnShow(authenticated.map(entry => entry.scope));
    console.log(`Staff scope verified across ${resolved.credentials.length} load shows.`);
    return;
  }
  console.log(
    `Per-show staff credentials present for ${resolved.credentials.length} load show(s): ` +
      resolved.credentials.map(credential => credential.email).join(', ')
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
