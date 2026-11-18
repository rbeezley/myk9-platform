import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { getCapturedInstallPrompt, startInstallPromptCapture } from './installPromptCapture';

/** The browser's install offer, as Chromium dispatches it. */
function installOffer() {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
}

describe('install offer kept from boot (MYK9-2140)', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
    localStorage.clear();
  });

  it('keeps nothing until the browser offers', () => {
    stop = startInstallPromptCapture();
    expect(getCapturedInstallPrompt()).toBeNull();
  });

  it('keeps the offer and holds the browser mini-infobar', () => {
    stop = startInstallPromptCapture();
    const offer = installOffer();
    window.dispatchEvent(offer);

    expect(getCapturedInstallPrompt()).toBe(offer);
    expect(offer.defaultPrevented).toBe(true);
  });

  it('forgets the offer once the app is installed', () => {
    stop = startInstallPromptCapture();
    window.dispatchEvent(installOffer());
    window.dispatchEvent(new Event('appinstalled'));

    expect(getCapturedInstallPrompt()).toBeNull();
  });

  it('listens once however often it is started, and stops cleanly', () => {
    stop = startInstallPromptCapture();
    expect(startInstallPromptCapture()).toBe(stop);
    stop();
    stop = undefined;
    window.dispatchEvent(installOffer());

    expect(getCapturedInstallPrompt()).toBeNull();
  });

  it('never shows a kept offer, even for one render, to someone who dismissed the banner', () => {
    localStorage.setItem('pwa_install_dismissed', JSON.stringify({ timestamp: Date.now() }));
    stop = startInstallPromptCapture();
    window.dispatchEvent(installOffer());

    const renders: Array<{ canInstall: boolean; isDismissed: boolean }> = [];
    renderHook(() => {
      const { canInstall, isDismissed } = usePWAInstall();
      renders.push({ canInstall, isDismissed });
    });

    expect(renders[0]).toEqual({ canInstall: true, isDismissed: true });
    expect(renders.every(render => render.isDismissed)).toBe(true);
  });

  it('lets a banner that mounts after the offer still make it', async () => {
    stop = startInstallPromptCapture();
    const offer = installOffer();
    window.dispatchEvent(offer);

    // The hook mounts late: the event has already fired and will not fire again.
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });
    expect(offer.prompt).toHaveBeenCalledTimes(1);
    // A prompt can be shown once, so the next banner must not start from the spent offer.
    expect(getCapturedInstallPrompt()).toBeNull();
  });
});
