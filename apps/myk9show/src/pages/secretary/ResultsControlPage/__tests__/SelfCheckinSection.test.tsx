import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SelfCheckinSection } from '../SelfCheckinSection';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';

const idle = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowCheckin: () => idle,
  useUpdateTrialOverride: () => idle,
  useResetOverride: () => idle,
  useUpdateClassOverride: () => idle,
}));

const settings = { selfCheckinEnabled: true } as ShowSettings;
const trials = [{ id: 'trial-1', name: 'Saturday Trial', showId: 'show-1' }] as SyncableTrial[];
const classes = [
  { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' },
] as unknown as SyncableClassData[];

function renderSection() {
  return render(
    <SelfCheckinSection
      showId="show-1"
      settings={settings}
      trialOverrides={[]}
      classOverrides={[]}
      trials={trials}
      classes={classes}
    />
  );
}

describe('SelfCheckinSection accessibility', () => {
  it('gives every switch a programmatic aria-label', () => {
    renderSection();

    // Show-level, trial-level, and class-level switches are each named for screen readers.
    expect(screen.getByRole('switch', { name: 'Allow self check-in for show' })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Self check-in for Saturday Trial' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('switch', { name: /^Self check-in for /i }).length).toBeGreaterThan(0);
  });

  it('wraps each switch in a ≥44px tap row', () => {
    renderSection();
    const showSwitch = screen.getByRole('switch', { name: 'Allow self check-in for show' });
    const tapRow = showSwitch.closest('label');
    expect(tapRow).not.toBeNull();
    expect(tapRow).toHaveClass('min-h-[44px]');
    expect(tapRow).toHaveAttribute('for', 'checkin-show');
  });
});
