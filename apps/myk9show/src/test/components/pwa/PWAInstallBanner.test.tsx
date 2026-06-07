import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import type { UsePWAInstallReturn } from '@/hooks/usePWAInstall';

const { mockUsePWAInstall } = vi.hoisted(() => ({
  mockUsePWAInstall: vi.fn(),
}));

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => mockUsePWAInstall(),
}));

const BANNER_CLASS = 'pwa-banner-visible';

function makeReturn(overrides: Partial<UsePWAInstallReturn> = {}): UsePWAInstallReturn {
  return {
    isInstalled: false,
    wasInstalledBefore: false,
    canInstall: false,
    isDismissed: false,
    isIOSSafari: false,
    promptInstall: vi.fn().mockResolvedValue(false),
    dismissInstallPrompt: vi.fn(),
    getInstallInstructions: vi.fn().mockReturnValue(''),
    ...overrides,
  };
}

describe('PWAInstallBanner', () => {
  beforeEach(() => {
    mockUsePWAInstall.mockReset();
    document.documentElement.classList.remove(BANNER_CLASS);
  });

  afterEach(() => {
    document.documentElement.classList.remove(BANNER_CLASS);
  });

  // The banner and the fixed AppHeader are both pinned to top-0. The whole
  // stacking fix hinges on the banner publishing its presence via this class so
  // the header/sidebar/sticky sub-headers offset below it (index.css drives the
  // CSS vars off the class). If the class stops toggling, the layout collides.
  it('adds the pwa-banner-visible class to <html> while showing', () => {
    mockUsePWAInstall.mockReturnValue(makeReturn({ isIOSSafari: true }));

    render(<PWAInstallBanner />);

    expect(screen.getByText('Install myK9Show')).toBeInTheDocument();
    expect(document.documentElement.classList.contains(BANNER_CLASS)).toBe(true);
  });

  it('does not render or set the class when the app is already installed', () => {
    mockUsePWAInstall.mockReturnValue(makeReturn({ isInstalled: true, isIOSSafari: true }));

    render(<PWAInstallBanner />);

    expect(screen.queryByText('Install myK9Show')).not.toBeInTheDocument();
    expect(document.documentElement.classList.contains(BANNER_CLASS)).toBe(false);
  });

  it('does not render or set the class when the prompt was dismissed', () => {
    mockUsePWAInstall.mockReturnValue(makeReturn({ canInstall: true, isDismissed: true }));

    render(<PWAInstallBanner />);

    expect(screen.queryByText('Install myK9Show')).not.toBeInTheDocument();
    expect(document.documentElement.classList.contains(BANNER_CLASS)).toBe(false);
  });

  it('removes the class on unmount so the header springs back to top-0', () => {
    mockUsePWAInstall.mockReturnValue(makeReturn({ canInstall: true }));

    const { unmount } = render(<PWAInstallBanner />);
    expect(document.documentElement.classList.contains(BANNER_CLASS)).toBe(true);

    unmount();
    expect(document.documentElement.classList.contains(BANNER_CLASS)).toBe(false);
  });
});
