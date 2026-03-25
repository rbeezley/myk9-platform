import { renderHook, act } from '@testing-library/react';
import { usePWAInstall } from './usePWAInstall';

describe('usePWAInstall', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset matchMedia to report non-standalone
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)' ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('returns not installed by default', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.canInstall).toBe(false);
    expect(result.current.isDismissed).toBe(false);
  });

  it('detects standalone mode as installed', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
  });

  it('dismisses and persists to localStorage', () => {
    const { result } = renderHook(() => usePWAInstall());

    act(() => {
      result.current.dismissInstallPrompt();
    });

    expect(result.current.isDismissed).toBe(true);
    expect(localStorage.getItem('pwa_install_dismissed')).toBeTruthy();
  });

  it('reads dismissed state from localStorage', () => {
    localStorage.setItem('pwa_install_dismissed', JSON.stringify({ timestamp: Date.now() }));

    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isDismissed).toBe(true);
  });

  it('clears expired dismiss state', () => {
    // Set dismissal 8 days ago (past the 7-day window)
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem('pwa_install_dismissed', JSON.stringify({ timestamp: eightDaysAgo }));

    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isDismissed).toBe(false);
    expect(localStorage.getItem('pwa_install_dismissed')).toBeNull();
  });

  it('detects previous installation from localStorage', () => {
    localStorage.setItem('pwa_installed', JSON.stringify({ timestamp: Date.now() }));

    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.wasInstalledBefore).toBe(true);
  });

  it('returns install instructions', () => {
    const { result } = renderHook(() => usePWAInstall());
    const instructions = result.current.getInstallInstructions();
    expect(typeof instructions).toBe('string');
    expect(instructions.length).toBeGreaterThan(0);
  });

  it('captures beforeinstallprompt event', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    expect(result.current.canInstall).toBe(true);
  });
});
