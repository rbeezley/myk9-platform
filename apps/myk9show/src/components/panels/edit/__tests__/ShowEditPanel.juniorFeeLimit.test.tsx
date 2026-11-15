/**
 * MYK9-1975: on the Fees tab the junior handler fee can't be saved above the show's lowest
 * regular fee, and lowering a fee tier below the junior fee is blocked the same way.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import type { Show } from '@/types/show-types';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/features/payments/useOnlineEntriesSwitch', () => ({
  useOnlineEntriesSwitch: () => ({
    value: false,
    pending: false,
    offline: false,
    setEnabled: vi.fn(async () => {}),
  }),
}));

const SHOW: Partial<Show> = {
  id: 'show-1',
  name: 'Fall Trial',
  status: 'published',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  location: 'Expo Hall',
  entryOpenDate: '2026-10-01',
  entryCloseDate: '2026-10-24',
  preEntryFee: '30',
  dayOfShowFee: '35',
  juniorHandlerFee: '15',
};

function renderPanel(show: Partial<Show> = SHOW) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <ShowEditPanel
      open
      onClose={vi.fn()}
      showId="show-1"
      showName="Fall Trial"
      initialTab="fees"
      initialShowData={show}
      onSave={onSave}
    />
  );
  return { ...utils, onSave };
}

async function setFee(user: ReturnType<typeof renderPanel>['user'], label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
  await user.tab();
}

const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

describe('Fees tab: the junior fee limit', () => {
  it('refuses a junior fee above the lowest regular fee and names the limit', async () => {
    const { user, onSave } = renderPanel();
    await setFee(user, 'Junior Handler Fee', '31');

    expect(
      await screen.findByText(
        "The junior fee can't be more than $30, the lowest class fee in this show."
      )
    ).toBeInTheDocument();

    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses lowering the pre-entry fee below the junior fee, shown as she types', async () => {
    const { user, onSave } = renderPanel();
    await setFee(user, 'Pre-Entry Fee', '10');

    expect(
      await screen.findByText(
        "The junior fee can't be more than $10, the lowest class fee in this show."
      )
    ).toBeInTheDocument();

    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses lowering the day-of fee below the junior fee', async () => {
    const { user, onSave } = renderPanel();
    await setFee(user, 'Day-of-Show Fee', '12.50');

    expect(
      await screen.findByText(
        "The junior fee can't be more than $12.50, the lowest class fee in this show."
      )
    ).toBeInTheDocument();
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves once the junior fee is lowered to match', async () => {
    const { user, onSave } = renderPanel();
    await setFee(user, 'Pre-Entry Fee', '10');
    await setFee(user, 'Junior Handler Fee', '10');

    await user.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved).toMatchObject({ preEntryFee: '10', juniorHandlerFee: '10' });
    expect(screen.queryByText(/the lowest class fee in this show/)).not.toBeInTheDocument();
  });

  it('never blocks an ASCA show, whose junior field is hidden and cleared on save', async () => {
    const { user, onSave } = renderPanel({ ...SHOW, organization: 'ASCA', juniorHandlerFee: '40' });
    await setFee(user, 'Pre-Entry Fee', '20');

    await user.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ preEntryFee: '20', juniorHandlerFee: '' });
  });
});
