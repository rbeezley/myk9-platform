import { describe, expect, it } from 'vitest';
import { computeOfflineReadiness, type ScopeReadiness } from './computeOfflineReadiness';

const hydrated = (label: string, lastSyncAt: number): ScopeReadiness => ({
  label,
  hydrated: true,
  lastSyncAt,
});

const cold = (label: string): ScopeReadiness => ({ label, hydrated: false, lastSyncAt: null });

describe('computeOfflineReadiness', () => {
  it('is ready when permissions are cached and every scope is hydrated', () => {
    const result = computeOfflineReadiness({
      permissionsCachedAt: 3_000,
      scopes: [hydrated('trials', 1_000), hydrated('classes', 2_000), hydrated('entries', 5_000)],
    });

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('reports the OLDEST timestamp across permissions and scopes as asOf', () => {
    const result = computeOfflineReadiness({
      permissionsCachedAt: 3_000,
      scopes: [hydrated('trials', 1_000), hydrated('entries', 5_000)],
    });

    expect(result.asOf).toBe(1_000);
  });

  it('is not ready without a permissions cache, naming permissions as missing', () => {
    const result = computeOfflineReadiness({
      permissionsCachedAt: null,
      scopes: [hydrated('trials', 1_000)],
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain('permissions');
  });

  it('is not ready when any scope is cold, naming that scope', () => {
    const result = computeOfflineReadiness({
      permissionsCachedAt: 3_000,
      scopes: [hydrated('trials', 1_000), cold('classes'), hydrated('entries', 5_000)],
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(['classes']);
  });

  it('is not ready with no scopes at all — an unknown show proves nothing', () => {
    const result = computeOfflineReadiness({ permissionsCachedAt: 3_000, scopes: [] });

    expect(result.ready).toBe(false);
  });

  it('returns a null asOf when not ready', () => {
    const result = computeOfflineReadiness({
      permissionsCachedAt: null,
      scopes: [cold('trials')],
    });

    expect(result.asOf).toBeNull();
  });
});
