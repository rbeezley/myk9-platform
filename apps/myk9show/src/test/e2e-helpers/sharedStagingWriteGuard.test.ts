import { describe, expect, it } from 'vitest';

import {
  classifySharedStagingWrite,
  SHARED_STAGING_PROJECT_REF,
} from '../e2e/helpers/sharedStagingWriteGuard';

const sharedBaseUrl = `https://${SHARED_STAGING_PROJECT_REF}.supabase.co`;

describe('classifySharedStagingWrite', () => {
  it('intercepts ringside scoring RPC writes to shared staging', () => {
    expect(
      classifySharedStagingWrite({
        method: 'POST',
        url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
      })
    ).toEqual({ kind: 'ringside-update-entry-rpc' });
  });

  it('intercepts direct entry patches to shared staging', () => {
    expect(
      classifySharedStagingWrite({
        method: 'PATCH',
        url: `${sharedBaseUrl}/rest/v1/entries?id=eq.entry-123`,
      })
    ).toEqual({ kind: 'entries-patch' });
  });

  it('does not intercept read requests to shared staging', () => {
    expect(
      classifySharedStagingWrite({
        method: 'GET',
        url: `${sharedBaseUrl}/rest/v1/entries?id=eq.entry-123`,
      })
    ).toBeNull();
  });

  it('does not intercept writes to an isolated Supabase project', () => {
    expect(
      classifySharedStagingWrite({
        method: 'POST',
        url: 'https://isolated-e2e-project.supabase.co/rest/v1/rpc/ringside_update_entry',
      })
    ).toBeNull();
  });
});
