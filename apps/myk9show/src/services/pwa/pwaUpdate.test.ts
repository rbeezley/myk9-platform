import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the package so we only verify wiring, not re-test package behavior.
// vi.mock is hoisted, so use vi.hoisted to share the spy with the factory.
const { setupPwaUpdateMock } = vi.hoisted(() => {
  const setupPwaUpdateMock = vi.fn();
  setupPwaUpdateMock.mockReturnValue({
    applyUpdate: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(false),
    onUpdateAvailable: vi.fn().mockReturnValue(() => {}),
    __reset: vi.fn(),
  });
  return { setupPwaUpdateMock };
});

vi.mock('@myk9/pwa-update', () => ({
  setupPwaUpdate: setupPwaUpdateMock,
  applyPwaUpdate: vi.fn().mockResolvedValue(undefined),
  checkForPwaUpdate: vi.fn().mockResolvedValue(false),
  onUpdateAvailable: vi.fn().mockReturnValue(() => {}),
  __resetPwaUpdateSingleton: vi.fn(),
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { __resetPwaUpdateForTests, isOnSensitiveRoute, setupPwa } from './pwaUpdate';

describe('myK9Show pwaUpdate wrapper', () => {
  beforeEach(() => {
    __resetPwaUpdateForTests();
    setupPwaUpdateMock.mockClear();
  });

  it("threads the app's buildTimestamp into the package as the version", () => {
    setupPwa({ onPrompt: vi.fn() });
    expect(setupPwaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'dev' })
    );
  });

  it('passes the app logger as a PwaLogger adapter', () => {
    setupPwa({ onPrompt: vi.fn() });
    const args = setupPwaUpdateMock.mock.calls[0]?.[0] as {
      logger: { info: (msg: string) => void };
    };
    expect(args.logger).toBeDefined();
    expect(typeof args.logger.info).toBe('function');
  });
});

describe('isOnSensitiveRoute', () => {
  const setPath = (path: string) => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: path },
    });
  };

  it.each([
    ['/checkout/success', true],
    ['/checkout/cancel', true],
    ['/shows/abc123/register', true],
    ['/exhibitor/check-in/entry-42', true],
    ['/secretary/register/show-1', true],
    ['/scoring/classes/c1/entries/e1', true],
  ])('defers prompts on %s', (path, expected) => {
    setPath(path);
    expect(isOnSensitiveRoute()).toBe(expected);
  });

  it.each([
    ['/'],
    ['/sign-in'],
    ['/dashboard'],
    ['/shows/abc123'], // detail page — not the register sub-route
    ['/admin/shows'],
  ])('does NOT defer on %s', path => {
    setPath(path);
    expect(isOnSensitiveRoute()).toBe(false);
  });
});
