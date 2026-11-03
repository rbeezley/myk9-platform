import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/services/pwa/pwaUpdate', () => ({
  applyPwaUpdate: vi.fn(),
  checkForPwaUpdate: vi.fn(),
  isOnSensitiveRoute: vi.fn(() => false),
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  handleStaleSchema,
  STALE_SCHEMA_GUARD_WINDOW_MS,
  type StaleSchemaDeps,
} from './staleSchemaRecovery';

function makeDeps(overrides: Partial<StaleSchemaDeps> = {}) {
  let guard: number | null = null;
  const clock = { at: 1_000_000 };
  const deps = {
    clock,
    now: vi.fn(() => clock.at),
    readGuard: vi.fn(() => guard),
    writeGuard: vi.fn((at: number) => {
      guard = at;
    }),
    isSensitiveRoute: vi.fn(() => false),
    updateAndReload: vi.fn(() => Promise.resolve()),
    showReloading: vi.fn(),
    showReloadPrompt: vi.fn(),
    ...overrides,
  };
  return deps;
}

describe('handleStaleSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reloads on the first signal and records the guard', () => {
    const deps = makeDeps();
    expect(handleStaleSchema('version-error', deps)).toBe('reloading');
    expect(deps.writeGuard).toHaveBeenCalledWith(1_000_000);
    expect(deps.showReloading).toHaveBeenCalledTimes(1);
    expect(deps.updateAndReload).toHaveBeenCalledTimes(1);
    expect(deps.showReloadPrompt).not.toHaveBeenCalled();
  });

  it('shows the Reload prompt instead of reloading again inside the window', () => {
    const deps = makeDeps();
    handleStaleSchema('version-error', deps);
    deps.clock.at = 1_000_000 + STALE_SCHEMA_GUARD_WINDOW_MS - 1;

    expect(handleStaleSchema('version-error', deps)).toBe('prompted');
    expect(deps.updateAndReload).toHaveBeenCalledTimes(1);
    expect(deps.showReloadPrompt).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the window has passed', () => {
    const deps = makeDeps();
    handleStaleSchema('version-error', deps);
    deps.clock.at = 1_000_000 + STALE_SCHEMA_GUARD_WINDOW_MS;

    expect(handleStaleSchema('version-error', deps)).toBe('reloading');
    expect(deps.updateAndReload).toHaveBeenCalledTimes(2);
  });

  it('never auto-reloads a versionchange on a sensitive route', () => {
    const deps = makeDeps({ isSensitiveRoute: vi.fn(() => true) });
    expect(handleStaleSchema('version-change', deps)).toBe('prompted');
    expect(deps.updateAndReload).not.toHaveBeenCalled();
    expect(deps.writeGuard).not.toHaveBeenCalled();
    expect(deps.showReloadPrompt).toHaveBeenCalledTimes(1);
  });

  it('still reloads a VersionError on a sensitive route (the store is unusable)', () => {
    const deps = makeDeps({ isSensitiveRoute: vi.fn(() => true) });
    expect(handleStaleSchema('version-error', deps)).toBe('reloading');
    expect(deps.updateAndReload).toHaveBeenCalledTimes(1);
  });

  it('auto-reloads a versionchange off the sensitive routes', () => {
    const deps = makeDeps();
    expect(handleStaleSchema('version-change', deps)).toBe('reloading');
  });
});
