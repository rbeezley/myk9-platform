import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { PresetSelector } from '../PresetSelector';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import type { VisibilityTiming } from '@myk9/secretary';

const mutate = vi.fn();

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => ({ mutate, isPending: false }),
}));

const mockNetworkState = vi.hoisted(() => ({ isOnline: true }));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkState,
}));

function makeSettings(visibility: {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
}): ShowSettings {
  return {
    visibility: { ...visibility, inheritedFrom: 'show' },
    selfCheckinEnabled: true,
    hasExplicitSettings: true,
  };
}

// Matches no named preset: placement manual_release with everything else immediate.
const CUSTOM = {
  placement: 'manual_release' as const,
  qualification: 'immediate' as const,
  time: 'immediate' as const,
  faults: 'immediate' as const,
};

// Exactly the 'standard' preset.
const STANDARD = {
  placement: 'class_complete' as const,
  qualification: 'immediate' as const,
  time: 'class_complete' as const,
  faults: 'class_complete' as const,
};

async function saveCustomTimings() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Advanced' }));
  await user.click(screen.getByRole('button', { name: 'Save Custom Timings' }));
}

describe('PresetSelector — honest custom-preset persistence', () => {
  beforeEach(() => {
    mutate.mockClear();
    mockNetworkState.isOnline = true;
  });

  it('persists preset: null when timings match no named preset (no coercion to standard)', async () => {
    render(<PresetSelector showId="show-1" settings={makeSettings(CUSTOM)} />);

    await saveCustomTimings();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      showId: 'show-1',
      preset: null,
      placementTiming: 'manual_release',
      qualificationTiming: 'immediate',
      timeTiming: 'immediate',
      faultsTiming: 'immediate',
    });
  });

  it('persists the named preset when timings exactly match one', async () => {
    render(<PresetSelector showId="show-1" settings={makeSettings(STANDARD)} />);

    await saveCustomTimings();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ showId: 'show-1', preset: 'standard' });
  });

  it('shows a "Custom timings active" status when no preset matches', () => {
    render(<PresetSelector showId="show-1" settings={makeSettings(CUSTOM)} />);
    expect(screen.getByRole('status')).toHaveTextContent(/custom timings active/i);
  });

  it('hides the custom status when a named preset is active', () => {
    render(<PresetSelector showId="show-1" settings={makeSettings(STANDARD)} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('PresetSelector — offline (MYK9-849)', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('disables preset cards and Save Custom Timings, and shows a "Needs a connection" hint', async () => {
    mockNetworkState.isOnline = false;
    const user = userEvent.setup();
    render(<PresetSelector showId="show-1" settings={makeSettings(STANDARD)} />);

    expect(screen.getByRole('button', { name: 'Apply "Immediately" preset' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText('Needs a connection', { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply "Immediately" preset' }));
    expect(mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByRole('button', { name: 'Save Custom Timings' })).toBeDisabled();
  });

  it('re-enables once back online', () => {
    mockNetworkState.isOnline = false;
    const { rerender } = render(<PresetSelector showId="show-1" settings={makeSettings(STANDARD)} />);
    expect(screen.getByRole('button', { name: 'Apply "Immediately" preset' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    mockNetworkState.isOnline = true;
    rerender(<PresetSelector showId="show-1" settings={makeSettings(STANDARD)} />);
    expect(screen.getByRole('button', { name: 'Apply "Immediately" preset' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
    expect(screen.queryByText('Needs a connection', { exact: false })).not.toBeInTheDocument();
  });
});
