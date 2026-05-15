import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setupPwaUpdate,
  __resetPwaUpdateSingleton,
  type RegisterSWOptions,
} from './index';

const makeRegisterSWMock = () => {
  const updateSW = vi.fn(async (_reload?: boolean) => {});
  const captured: { opts?: RegisterSWOptions } = {};
  const registerSW = vi.fn((opts: RegisterSWOptions) => {
    captured.opts = opts;
    return updateSW;
  });
  return { registerSW, updateSW, captured };
};

describe('@myk9/pwa-update', () => {
  beforeEach(() => {
    __resetPwaUpdateSingleton();
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    // jsdom doesn't expose navigator.serviceWorker, so stub the surface
    // setupPwaUpdate touches: addEventListener for 'controllerchange' and
    // getRegistration for checkForUpdate.
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getRegistration: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onPrompt the first time onNeedRefresh runs for a version', () => {
    const { registerSW, captured } = makeRegisterSWMock();
    const onPrompt = vi.fn();
    setupPwaUpdate({ registerSW, version: 'v1', onPrompt });
    captured.opts?.onNeedRefresh?.();
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('suppresses repeat prompts for the same version (prompt-once)', () => {
    const { registerSW, captured } = makeRegisterSWMock();
    const onPrompt = vi.fn();
    setupPwaUpdate({ registerSW, version: 'v1', onPrompt });
    captured.opts?.onNeedRefresh?.();
    captured.opts?.onNeedRefresh?.();
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('persists the prompted version to localStorage', () => {
    const { registerSW, captured } = makeRegisterSWMock();
    setupPwaUpdate({ registerSW, version: 'v1', onPrompt: vi.fn() });
    captured.opts?.onNeedRefresh?.();
    expect(localStorage.getItem('sw_prompted_version')).toBe('v1');
  });

  it('honors a custom promptedKey', () => {
    const { registerSW, captured } = makeRegisterSWMock();
    setupPwaUpdate({
      registerSW,
      version: 'v1',
      onPrompt: vi.fn(),
      promptedKey: 'my_app_pwa_key',
    });
    captured.opts?.onNeedRefresh?.();
    expect(localStorage.getItem('my_app_pwa_key')).toBe('v1');
    expect(localStorage.getItem('sw_prompted_version')).toBeNull();
  });

  it('still dedups when localStorage throws (Safari Private Mode)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    const { registerSW, captured } = makeRegisterSWMock();
    const onPrompt = vi.fn();
    setupPwaUpdate({ registerSW, version: 'v1', onPrompt });
    captured.opts?.onNeedRefresh?.();
    captured.opts?.onNeedRefresh?.();
    expect(onPrompt).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it('defers the prompt while shouldDefer returns true, fires once it returns false', () => {
    vi.useFakeTimers();
    const { registerSW, captured } = makeRegisterSWMock();
    const onPrompt = vi.fn();
    let deferring = true;
    setupPwaUpdate({
      registerSW,
      version: 'v1',
      onPrompt,
      shouldDefer: () => deferring,
      deferralRetryMs: 1000,
    });
    captured.opts?.onNeedRefresh?.();
    expect(onPrompt).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onPrompt).not.toHaveBeenCalled();

    deferring = false;
    vi.advanceTimersByTime(1000);
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('different versions get separate prompts (across simulated page reloads)', () => {
    // Simulate: app loads with v1, prompts, page reloads with v2 (singleton reset).
    const a = makeRegisterSWMock();
    const onPromptA = vi.fn();
    setupPwaUpdate({ registerSW: a.registerSW, version: 'v1', onPrompt: onPromptA });
    a.captured.opts?.onNeedRefresh?.();

    __resetPwaUpdateSingleton();

    const b = makeRegisterSWMock();
    const onPromptB = vi.fn();
    setupPwaUpdate({ registerSW: b.registerSW, version: 'v2', onPrompt: onPromptB });
    b.captured.opts?.onNeedRefresh?.();

    expect(onPromptA).toHaveBeenCalledTimes(1);
    expect(onPromptB).toHaveBeenCalledTimes(1);
  });

  it('applyUpdate skips updateSW when offline', async () => {
    const { registerSW, updateSW } = makeRegisterSWMock();
    const ctrl = setupPwaUpdate({ registerSW, version: 'v1', onPrompt: vi.fn() });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await ctrl.applyUpdate();
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('applyUpdate calls updateSW(true) when online', async () => {
    const { registerSW, updateSW } = makeRegisterSWMock();
    const ctrl = setupPwaUpdate({ registerSW, version: 'v1', onPrompt: vi.fn() });
    await ctrl.applyUpdate();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('onUpdateAvailable subscribers fire on each onNeedRefresh, even after first prompt', () => {
    const { registerSW, captured } = makeRegisterSWMock();
    const ctrl = setupPwaUpdate({ registerSW, version: 'v1', onPrompt: vi.fn() });
    const handler = vi.fn();
    ctrl.onUpdateAvailable(handler);
    captured.opts?.onNeedRefresh?.();
    captured.opts?.onNeedRefresh?.();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops the handler from firing', () => {
    const { registerSW, captured } = makeRegisterSWMock();
    const ctrl = setupPwaUpdate({ registerSW, version: 'v1', onPrompt: vi.fn() });
    const handler = vi.fn();
    const unsubscribe = ctrl.onUpdateAvailable(handler);
    captured.opts?.onNeedRefresh?.();
    unsubscribe();
    captured.opts?.onNeedRefresh?.();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('setupPwaUpdate is idempotent — second call returns the same controller', () => {
    const a = makeRegisterSWMock();
    const ctrl1 = setupPwaUpdate({ registerSW: a.registerSW, version: 'v1', onPrompt: vi.fn() });
    const ctrl2 = setupPwaUpdate({ registerSW: a.registerSW, version: 'v1', onPrompt: vi.fn() });
    expect(ctrl1).toBe(ctrl2);
    expect(a.registerSW).toHaveBeenCalledTimes(1);
  });

  it('module-level applyPwaUpdate uses the singleton controller', async () => {
    const { registerSW, updateSW } = makeRegisterSWMock();
    setupPwaUpdate({ registerSW, version: 'v1', onPrompt: vi.fn() });
    const { applyPwaUpdate } = await import('./index');
    await applyPwaUpdate();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('logger.error fires when registerSW throws', () => {
    const errorLog = vi.fn();
    setupPwaUpdate({
      registerSW: () => {
        throw new Error('boom');
      },
      version: 'v1',
      onPrompt: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: errorLog },
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[PWA] setup threw',
      expect.objectContaining({ error: expect.stringContaining('boom') })
    );
  });
});
