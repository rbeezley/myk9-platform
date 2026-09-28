import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SettingsOverrideCard } from './SettingsOverrideCard';
import type { VisibilitySettings } from '@myk9/secretary';

const mockTrialMutate = vi.fn();
const mockClassMutate = vi.fn();
const mockResetMutate = vi.fn();

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateTrialOverride: () => ({ mutate: mockTrialMutate, isPending: false }),
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
  useResetOverride: () => ({ mutate: mockResetMutate, isPending: false }),
}));

const mockNetworkState = vi.hoisted(() => ({ isOnline: true }));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkState,
}));

const currentSettings: VisibilitySettings = {
  placement: 'class_complete',
  qualification: 'immediate',
  time: 'class_complete',
  faults: 'class_complete',
  preset: 'standard',
  inheritedFrom: 'show',
};

function renderCard(overrides: Partial<React.ComponentProps<typeof SettingsOverrideCard>> = {}) {
  return render(
    <SettingsOverrideCard
      level="trial"
      entityId="trial-1"
      showId="show-1"
      currentSettings={currentSettings}
      selfCheckinEnabled={true}
      {...overrides}
    />
  );
}

describe('SettingsOverrideCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNetworkState.isOnline = true;
  });

  it('applies a preset and toggles check-in while online', async () => {
    const { user } = renderCard();

    expect(screen.getByRole('switch')).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('switch'));
    expect(mockTrialMutate).toHaveBeenCalledWith(
      expect.objectContaining({ trialId: 'trial-1', showId: 'show-1', selfCheckinEnabled: false })
    );
  });

  describe('offline (MYK9-849)', () => {
    beforeEach(() => {
      mockNetworkState.isOnline = false;
    });

    it('disables the preset select, per-field selects, and check-in switch, with a hint', async () => {
      const { user } = renderCard();

      expect(screen.getByText('Needs a connection')).toBeInTheDocument();
      expect(screen.getByRole('switch')).toHaveAttribute('aria-disabled', 'true');

      const comboboxes = screen.getAllByRole('combobox');
      comboboxes.forEach(combobox => expect(combobox).toBeDisabled());

      await user.click(screen.getByRole('switch'));
      expect(mockTrialMutate).not.toHaveBeenCalled();
    });

    it('re-enables once back online', () => {
      const { rerender } = renderCard();
      expect(screen.getByRole('switch')).toHaveAttribute('aria-disabled', 'true');

      mockNetworkState.isOnline = true;
      rerender(
        <SettingsOverrideCard
          level="trial"
          entityId="trial-1"
          showId="show-1"
          currentSettings={currentSettings}
          selfCheckinEnabled={true}
        />
      );
      expect(screen.getByRole('switch')).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByText('Needs a connection')).not.toBeInTheDocument();
    });
  });
});
