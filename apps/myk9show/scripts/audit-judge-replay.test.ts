import { describe, expect, it } from 'vitest';

import {
  auditReplayPlaywrightEnv,
  DEFAULT_OWNED_PORT,
  MAX_OWNED_PORT,
  JUDGE_REPLAY_PROJECT,
  JUDGE_REPLAY_SPECS,
  resolveAuditReplayPlan,
} from './audit-judge-replay';

const SHARED_STAGING_URL = 'https://sojmvhhwsjxmfistvzbe.supabase.co';

describe('resolveAuditReplayPlan — attach mode', () => {
  it('attaches to a named loopback server without claiming a port to bind', () => {
    const plan = resolveAuditReplayPlan({
      PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5789',
      PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
      VITE_SUPABASE_URL: SHARED_STAGING_URL,
    });

    expect(plan.mode).toBe('attach');
    expect(plan.baseURL).toBe('http://127.0.0.1:5789');
    expect(plan.serverId).toBe('walk-server-1');
    // The whole point of attach mode: nothing for the wrapper to bind.
    expect(plan.port).toBeNull();
  });

  it('refuses a base URL whose server identity was not declared', () => {
    expect(() =>
      resolveAuditReplayPlan({
        PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5789',
        VITE_SUPABASE_URL: SHARED_STAGING_URL,
      })
    ).toThrow(/without PLAYWRIGHT_AUDIT_SERVER_ID/);
  });

  it('refuses a server identity with no base URL to apply it to', () => {
    expect(() =>
      resolveAuditReplayPlan({
        PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
        VITE_SUPABASE_URL: SHARED_STAGING_URL,
      })
    ).toThrow(/without PLAYWRIGHT_AUDIT_BASE_URL/);
  });

  it('refuses a non-loopback target', () => {
    expect(() =>
      resolveAuditReplayPlan({
        PLAYWRIGHT_AUDIT_BASE_URL: 'https://myk9-platform-myk9show.vercel.app',
        PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
        VITE_SUPABASE_URL: SHARED_STAGING_URL,
      })
    ).toThrow(/unambiguous loopback HTTP origin/);
  });

  it('ignores an operator attempt to widen the data target', () => {
    // A run that wrote to shared staging for real would still be reported as an
    // audit, so the interception is asserted rather than read from the caller.
    const plan = resolveAuditReplayPlan({
      PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5789',
      PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
      PLAYWRIGHT_AUDIT_DATA_TARGET: 'shared-staging-live',
      VITE_SUPABASE_URL: SHARED_STAGING_URL,
    });

    expect(plan.dataTarget).toBe('shared-staging-intercepted');
  });

  it('refuses a Supabase target that is not the declared shared staging project', () => {
    expect(() =>
      resolveAuditReplayPlan({
        PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5789',
        PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
        VITE_SUPABASE_URL: 'https://some-other-project.supabase.co',
      })
    ).toThrow(/does not identify the declared shared staging target/);
  });
});

describe('resolveAuditReplayPlan — own mode', () => {
  it('owns a server on the default port when given no target at all', () => {
    const plan = resolveAuditReplayPlan({ VITE_SUPABASE_URL: SHARED_STAGING_URL });

    expect(plan.mode).toBe('own');
    expect(plan.port).toBe(DEFAULT_OWNED_PORT);
    expect(plan.baseURL).toBe(`http://127.0.0.1:${DEFAULT_OWNED_PORT}`);
    expect(plan.serverId).toBe(`audit-judge-replay-${DEFAULT_OWNED_PORT}`);
  });

  it('derives an identity from the run id when one is given', () => {
    const plan = resolveAuditReplayPlan({
      VITE_SUPABASE_URL: SHARED_STAGING_URL,
      MYK9_AUDIT_REPLAY_RUN_ID: '2026-08-05T22-10Z',
    });

    expect(plan.serverId).toBe('audit-judge-replay-2026-08-05T22-10Z');
  });

  it('accepts the highest port that still leaves room for the HMR port', () => {
    const plan = resolveAuditReplayPlan({
      VITE_SUPABASE_URL: SHARED_STAGING_URL,
      MYK9_AUDIT_REPLAY_PORT: String(MAX_OWNED_PORT),
    });

    expect(plan.port).toBe(MAX_OWNED_PORT);
  });

  it('honours an explicit port', () => {
    const plan = resolveAuditReplayPlan({
      VITE_SUPABASE_URL: SHARED_STAGING_URL,
      MYK9_AUDIT_REPLAY_PORT: '5931',
    });

    expect(plan.port).toBe(5931);
    expect(plan.baseURL).toBe('http://127.0.0.1:5931');
  });

  it.each(['0', 'not-a-port', '80', '70000', '50000'])('refuses port %s', port => {
    // 50000 is a valid TCP port but derives an out-of-range HMR port, which
    // would kill Vite before the identity endpoint came up.
    expect(() =>
      resolveAuditReplayPlan({
        VITE_SUPABASE_URL: SHARED_STAGING_URL,
        MYK9_AUDIT_REPLAY_PORT: port,
      })
    ).toThrow(/MYK9_AUDIT_REPLAY_PORT/);
  });

  it('refuses a run id that could escape into the shell or the identity string', () => {
    expect(() =>
      resolveAuditReplayPlan({
        VITE_SUPABASE_URL: SHARED_STAGING_URL,
        MYK9_AUDIT_REPLAY_RUN_ID: 'run; rm -rf /',
      })
    ).toThrow(/MYK9_AUDIT_REPLAY_RUN_ID/);
  });

  it('refuses to run with no Supabase target configured', () => {
    expect(() => resolveAuditReplayPlan({})).toThrow(/VITE_SUPABASE_URL/);
  });
});

describe('the replay scope', () => {
  it('runs both judge scoring specs at the ringside tablet viewport', () => {
    const plan = resolveAuditReplayPlan({ VITE_SUPABASE_URL: SHARED_STAGING_URL });

    expect(plan.project).toBe(JUDGE_REPLAY_PROJECT);
    expect(plan.specs).toEqual([...JUDGE_REPLAY_SPECS]);
  });

  it('hands Playwright exactly the three variables its audit config reads', () => {
    const plan = resolveAuditReplayPlan({
      PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5789',
      PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
      VITE_SUPABASE_URL: SHARED_STAGING_URL,
    });

    expect(auditReplayPlaywrightEnv(plan)).toEqual({
      PLAYWRIGHT_AUDIT_BASE_URL: 'http://127.0.0.1:5789',
      PLAYWRIGHT_AUDIT_SERVER_ID: 'walk-server-1',
      PLAYWRIGHT_AUDIT_DATA_TARGET: 'shared-staging-intercepted',
    });
  });
});
