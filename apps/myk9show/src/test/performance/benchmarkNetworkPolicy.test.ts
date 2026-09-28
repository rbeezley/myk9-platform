import { describe, expect, it } from 'vitest';
import { benchmarkRequestDisposition } from './benchmarkNetworkPolicy';

const base = 'https://example.supabase.co';

describe('benchmarkRequestDisposition', () => {
  it('allows reads and token refresh', () => {
    expect(benchmarkRequestDisposition('GET', `${base}/rest/v1/shows`, base)).toBe('continue');
    expect(
      benchmarkRequestDisposition('POST', `${base}/auth/v1/token?grant_type=refresh_token`, base)
    ).toBe('continue');
  });

  it('allows the read-only admin roster RPC required by /admin/users', () => {
    expect(
      benchmarkRequestDisposition('POST', `${base}/rest/v1/rpc/get_admin_user_list`, base)
    ).toBe('continue');
  });

  it('acknowledges telemetry without sending it to staging', () => {
    expect(benchmarkRequestDisposition('POST', `${base}/functions/v1/receive-logs`, base)).toBe(
      'acknowledge'
    );
    expect(benchmarkRequestDisposition('POST', `${base}/rest/v1/analytics_events`, base)).toBe(
      'acknowledge'
    );
  });

  it('blocks writes and lookalike origins', () => {
    expect(benchmarkRequestDisposition('POST', `${base}/rest/v1/shows`, base)).toBe('block');
    expect(benchmarkRequestDisposition('DELETE', `${base}/rest/v1/shows`, base)).toBe('block');
    expect(
      benchmarkRequestDisposition('POST', `${base}.attacker.test/functions/v1/receive-logs`, base)
    ).toBe('block');
  });
});
