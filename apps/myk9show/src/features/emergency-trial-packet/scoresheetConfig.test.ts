// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { listRegistries } from '@/features/registries';
import {
  GENERIC_SCORESHEET_CONFIG,
  SCORESHEET_CONFIGS,
  resolveScoresheetConfig,
} from './scoresheetConfig';

describe('resolveScoresheetConfig', () => {
  it('returns the registry-specific config when the id is known', () => {
    const config = resolveScoresheetConfig('akc');
    expect(config.orgTitle).toBe('AKC Scent Work');
    expect(config.resultStates).toEqual(['Q', 'NQ', 'EX', 'ABS']);
  });

  it('resolves an UPPERCASE registry id, the shape every app trial actually has', () => {
    // App registry ids are uppercase ('AKC' | 'UKC' | 'ASCA' — see
    // `readTrialRegistryId`); `SCORESHEET_CONFIGS`'s keys are lowercase. This
    // is the production path for every trial: dropping the `.toLowerCase()`
    // in `resolveScoresheetConfig` would silently fall every real sheet back
    // to the generic config, and nothing before this test would notice.
    const config = resolveScoresheetConfig('AKC');
    expect(config).toBe(SCORESHEET_CONFIGS.akc);
    expect(config.orgTitle).toBe('AKC Scent Work');
  });

  it('covers every registry id the app actually has, case-insensitively', () => {
    // The spec requires this coverage check; it had never been written. A
    // registry added to `@/features/registries` without a matching
    // `SCORESHEET_CONFIGS` entry falls back to the generic sheet for every
    // trial under that registry, silently.
    for (const registryId of listRegistries()) {
      expect(
        SCORESHEET_CONFIGS[registryId.toLowerCase()],
        `no scoresheet config for registry "${registryId}"`
      ).toBeDefined();
    }
  });

  it('falls back to the generic config rather than throwing on an unknown id', () => {
    // A packet that fails to render at 6am because a trial carries an
    // unexpected registry id is worse than one with generic reason lists.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveScoresheetConfig('not-a-registry')).toBe(GENERIC_SCORESHEET_CONFIG);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back on a null id without warning', () => {
    // Null is "no registry recorded", which is expected data, not a misconfiguration.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveScoresheetConfig(null)).toBe(GENERIC_SCORESHEET_CONFIG);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('gives every config a non-empty NQ and EX list', () => {
    for (const [id, config] of Object.entries(SCORESHEET_CONFIGS)) {
      expect(config.nqReasons.length, `${id} nqReasons`).toBeGreaterThan(0);
      expect(config.exReasons.length, `${id} exReasons`).toBeGreaterThan(0);
      expect(config.faultCounters.length, `${id} faultCounters`).toBeGreaterThan(0);
    }
  });

  it('keeps every reason short enough to print in the 45mm reason column', () => {
    // The column fits roughly 26 characters at 7pt. A longer reason is not a
    // wrapping bug — fitTextToWidth would shrink it to unreadable.
    for (const config of Object.values(SCORESHEET_CONFIGS)) {
      for (const reason of [...config.nqReasons, ...config.exReasons]) {
        expect(reason.length, reason).toBeLessThanOrEqual(26);
      }
    }
  });
});
