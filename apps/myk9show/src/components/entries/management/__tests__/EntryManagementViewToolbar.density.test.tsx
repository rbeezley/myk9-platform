/**
 * Codex finding on MYK9-795: the previous Entry Management toolbar had a
 * "Density" control (comfortable/compact registration rows); the unified
 * `EntryManagementViewToolbar` replaced it with no equivalent, even though
 * `cockpit.state.density` / `cockpit.setDensity` are still read and wired.
 * This proves the control is back and reaches the same handler.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { EntryManagementViewToolbar } from '../EntryManagementViewToolbar';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';

const BASE_STATE: EntryManagementCockpitState = {
  tab: 'registrations',
  exception: 'move-ups',
  queue: 'needs-review',
  search: '',
  density: 'comfortable',
  trialId: null,
  classId: null,
  registrationKey: null,
};

const COUNTS = {
  queueCounts: { 'needs-review': 0, 'missing-information': 0, 'payment-due': 0, all: 0 },
  pulls: 0,
  moveUps: 0,
};

function renderToolbar(
  overrides: Partial<EntryManagementCockpitState> = {},
  onDensityChange = vi.fn()
) {
  render(
    <EntryManagementViewToolbar
      state={{ ...BASE_STATE, ...overrides }}
      counts={COUNTS}
      trials={[]}
      trialClasses={[]}
      density={overrides.density ?? BASE_STATE.density}
      onSelectView={vi.fn()}
      onScopeChange={vi.fn()}
      onSearchChange={vi.fn()}
      onDensityChange={onDensityChange}
      onClearAll={vi.fn()}
      result={{ shown: 0, total: 0 }}
    />
  );
  return { onDensityChange };
}

describe('EntryManagementViewToolbar density control', () => {
  it('offers a Density control on the registrations view', async () => {
    renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: /density/i }));

    expect(screen.getByRole('group', { name: /row density/i })).toBeInTheDocument();
  });

  it('calls onDensityChange with the selected density', async () => {
    const { onDensityChange } = renderToolbar({ density: 'comfortable' });

    await userEvent.click(screen.getByRole('button', { name: /density/i }));
    await userEvent.click(screen.getByRole('button', { name: /compact/i }));

    expect(onDensityChange).toHaveBeenCalledWith('compact');
  });

  it('omits the Density control on the exceptions view (no registration rows to size)', () => {
    renderToolbar({ tab: 'exceptions' });

    expect(screen.queryByRole('button', { name: /density/i })).not.toBeInTheDocument();
  });
});
