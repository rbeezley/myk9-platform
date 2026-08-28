import { describe, expect, it } from 'vitest';
import { LOAD_SHOWS } from './loadFixture';
import {
  assertScopedToOwnShow,
  assertStaffCredentialsComplete,
  resolveStaffCredentials,
  staffEmailForShow,
  staffPasswordEnvForShow,
} from './loadStaffCredentials';

function fullEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const show of LOAD_SHOWS) {
    env[staffPasswordEnvForShow(show.index)] = `pw-${show.index}`;
  }
  return env;
}

describe('per-show staff credentials', () => {
  it('needs one credential per show', () => {
    const resolved = resolveStaffCredentials(fullEnv());
    expect(resolved.credentials).toHaveLength(LOAD_SHOWS.length);
    expect(resolved.missing).toHaveLength(0);
    expect(new Set(resolved.credentials.map(c => c.email)).size).toBe(LOAD_SHOWS.length);
    expect(new Set(resolved.credentials.map(c => c.showId)).size).toBe(LOAD_SHOWS.length);
  });

  it('keeps the canonical secretary on the original show', () => {
    // Show 0 is unchanged so every prior measurement against it stays comparable.
    expect(staffEmailForShow(0)).toBe('secretary@myk9t.com');
    expect(staffPasswordEnvForShow(0)).toBe('E2E_SECRETARY_PASSWORD');
    expect(staffEmailForShow(1)).toBe('load-secretary-1@myk9t.com');
    expect(staffPasswordEnvForShow(1)).toBe('E2E_LOAD_SECRETARY_1_PASSWORD');
  });

  it('reports every missing credential rather than only the first', () => {
    const env = fullEnv();
    delete env[staffPasswordEnvForShow(1)];
    delete env[staffPasswordEnvForShow(3)];
    const resolved = resolveStaffCredentials(env);
    expect(resolved.missing.map(m => m.showIndex)).toEqual([1, 3]);
  });

  it('refuses to start when a credential is missing', () => {
    const env = fullEnv();
    delete env[staffPasswordEnvForShow(2)];
    expect(() => assertStaffCredentialsComplete(resolveStaffCredentials(env))).toThrow(
      /not provisioned[\s\S]*load-secretary-2@myk9t\.com/
    );
  });

  it('names the environment variable so the fix is obvious', () => {
    const env = fullEnv();
    delete env[staffPasswordEnvForShow(2)];
    expect(() => assertStaffCredentialsComplete(resolveStaffCredentials(env))).toThrow(
      /E2E_LOAD_SECRETARY_2_PASSWORD/
    );
  });

  it('passes silently when every credential is present', () => {
    expect(() => assertStaffCredentialsComplete(resolveStaffCredentials(fullEnv()))).not.toThrow();
  });
});

describe('scope verification against the database', () => {
  function scopes(overrides: Record<number, string[]> = {}) {
    return LOAD_SHOWS.map(show => ({
      showIndex: show.index,
      email: staffEmailForShow(show.index),
      manageableShowIds: overrides[show.index] ?? [show.showId],
    }));
  }

  it('accepts a credential that manages exactly its own show', () => {
    expect(() => assertScopedToOwnShow(scopes())).not.toThrow();
  });

  it('rejects a credential that manages every fixture show', () => {
    // The failure mode this exists to catch: one club-level secretary across all
    // four shows, which is what the runner did before per-show credentials and
    // what `is_trial_secretary(s.club_id)` would still produce on a shared club.
    const everything = LOAD_SHOWS.map(show => show.showId);
    expect(() => assertScopedToOwnShow(scopes({ 1: everything }))).toThrow(
      /not scoped to one show/
    );
  });

  it('rejects a credential that manages the wrong show', () => {
    expect(() => assertScopedToOwnShow(scopes({ 2: [LOAD_SHOWS[0].showId] }))).toThrow(
      /must manage exactly/
    );
  });

  it('rejects a credential that manages nothing', () => {
    // A grant that never landed reads as an empty scope, not an error, so an
    // unasserted run would simply fail every workflow with no explanation.
    expect(() => assertScopedToOwnShow(scopes({ 3: [] }))).toThrow(/must manage exactly/);
  });

  it('reports every mis-scoped credential at once', () => {
    const everything = LOAD_SHOWS.map(show => show.showId);
    let message = '';
    try {
      assertScopedToOwnShow(scopes({ 1: everything, 2: [] }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('load-secretary-1@myk9t.com');
    expect(message).toContain('load-secretary-2@myk9t.com');
  });
});
