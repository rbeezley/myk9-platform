import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { SlideOverPanel } from '../SlideOverPanel';

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    isInstalled: false,
    wasInstalledBefore: false,
    canInstall: false,
    isDismissed: false,
    isIOSSafari: true,
    promptInstall: vi.fn().mockResolvedValue(false),
    dismissInstallPrompt: vi.fn(),
    getInstallInstructions: vi.fn().mockReturnValue(''),
  }),
}));

// jsdom loads no Tailwind CSS, so the layer is read off the z-utility the real element renders.
function layerOf(el: Element | null): number {
  const match = el?.className.match(/(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/);
  if (!match) throw new Error('no z-index utility on element');
  return Number(match[1] ?? match[2]);
}

describe('overlay layer order (MYK9-1666)', () => {
  it('keeps the install banner below the panel layer, above the z-40 at-show feed', () => {
    render(
      <>
        <PWAInstallBanner />
        <SlideOverPanel open onClose={() => {}} title="Menu">
          <p>content</p>
        </SlideOverPanel>
      </>
    );

    const banner = screen.getByText('Install myK9Show').closest('.fixed');
    const panel = screen.getByRole('dialog');
    expect(layerOf(banner)).toBeLessThan(layerOf(panel));
    expect(layerOf(banner)).toBeGreaterThan(40);
  });
});
