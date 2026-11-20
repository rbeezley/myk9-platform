import { describe, expect, it } from 'vitest';
import { computeOfflineReadiness } from './computeOfflineReadiness';
import { toScope } from './showStructureScopes';

// MYK9-2254: a short download records the server's count and stays short on the
// device, so the readiness gate reads the scope as not saved.
describe('a scope left short by a download (MYK9-2254)', () => {
  it('reads as not hydrated, so the badge says the offline copy is not saved', () => {
    const scope = toScope('classes', { expectedRemoteRows: 5, lastIncrementalSyncAt: 9 }, 3);

    expect(scope.hydrated).toBe(false);
    const readiness = computeOfflineReadiness({ permissionsCachedAt: 1, scopes: [scope] });
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(['classes']);
  });

  it('reads as hydrated once the device holds every row', () => {
    expect(
      toScope('classes', { expectedRemoteRows: 5, lastIncrementalSyncAt: 9 }, 5).hydrated
    ).toBe(true);
  });
});
