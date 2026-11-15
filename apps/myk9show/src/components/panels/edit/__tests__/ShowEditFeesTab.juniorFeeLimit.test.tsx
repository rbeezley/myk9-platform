/**
 * MYK9-1975: on the show's Fees tab the junior handler fee can't be saved above the
 * lowest regular fee, and lowering a fee below the junior fee is refused the same way.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import type { Show } from '@/types/show-types';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [], loadUsers: vi.fn() }),
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

const show = (fees: Partial<Show>): Partial<Show> => ({
  id: 'show-1',
  name: 'Heartland',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-11-01',
  endDate: '2026-11-02',
  ...fees,
});

function renderPanel(fees: Partial<Show>) {
  const onSave = vi.fn(async () => {});
  const utils = render(
    <ShowEditPanel
      open
      onClose={vi.fn()}
      showId="show-1"
      showName="Heartland"
      initialTab="fees"
      onSave={onSave}
      initialShowData={show(fees)}
    />
  );
  const setFee = async (label: string, value: string) => {
    const input = await screen.findByLabelText(label);
    await utils.user.clear(input);
    await utils.user.type(input, value);
    await utils.user.tab();
  };
  return { ...utils, onSave, setFee };
}

describe('junior handler fee limit on the Fees tab', () => {
  it('refuses a junior fee above the pre-entry fee and names the limit', async () => {
    const { user, onSave, setFee } = renderPanel({ preEntryFee: '15' });

    await setFee('Junior Handler Fee', '20');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText(
        "The junior fee can't be more than $15, the lowest class fee in this show."
      )
    ).toBeVisible();
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'juniorHandlerFee'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses lowering the pre-entry fee below the junior fee', async () => {
    const { user, onSave, setFee } = renderPanel({ preEntryFee: '15', juniorHandlerFee: '15' });

    await setFee('Pre-Entry Fee', '10');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText(
        "The junior fee can't be more than $10, the lowest class fee in this show."
      )
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('counts a day-of fee below the junior fee', async () => {
    const { user, onSave, setFee } = renderPanel({ preEntryFee: '30', juniorHandlerFee: '10' });

    await setFee('Day-of-Show Fee', '12.5');
    await setFee('Junior Handler Fee', '15');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText(
        "The junior fee can't be more than $12.50, the lowest class fee in this show."
      )
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('with no pre-entry fee, counts the class fees the show was loaded with', async () => {
    const { user, onSave, setFee } = renderPanel({
      preEntryFee: '',
      trials: [
        {
          id: 't1',
          name: 'Saturday',
          date: '2026-11-01',
          trialNumber: '1',
          status: 'upcoming',
          classes: [
            { id: 'c1', name: 'Container Novice', entryFee: 25 },
            { id: 'c2', name: 'Interior Novice', entryFee: 14 },
          ],
        },
      ],
    });

    await setFee('Junior Handler Fee', '15');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText(
        "The junior fee can't be more than $14, the lowest class fee in this show."
      )
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a junior fee equal to the lowest regular fee', async () => {
    const { user, onSave, setFee } = renderPanel({ preEntryFee: '15', dayOfShowFee: '25' });

    await setFee('Junior Handler Fee', '15');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ preEntryFee: '15', juniorHandlerFee: '15' })
      )
    );
    expect(screen.queryByText(/The junior fee can't be more than/)).not.toBeInTheDocument();
  });

  it('does not limit an ASCA show, which has no junior fee', async () => {
    const { user, onSave, setFee } = renderPanel({
      organization: 'ASCA',
      preEntryFee: '15',
      juniorHandlerFee: '20',
    });

    await setFee('Pre-Entry Fee', '10');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
