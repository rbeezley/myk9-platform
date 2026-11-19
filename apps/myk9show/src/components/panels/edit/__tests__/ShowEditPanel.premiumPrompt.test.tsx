/**
 * MYK9-2201: Save with premium edits and the publish box unticked asks what to do with them.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import type { Show } from '@/types/show-types';
import type { GeneratedPremium } from '@/types/premium-types';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  usePublishedExperienceContent: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: undefined }),
}));
// The editor reports the premium it holds and whether it was edited; two buttons stand in for it.
vi.mock('@/features/premium/PremiumContentEditor', () => ({
  PremiumContentEditor: (props: {
    onPremiumChange?: (premium: GeneratedPremium) => void;
    onEditedChange?: (edited: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => props.onPremiumChange?.(generatedPremium())}>
        Load premium
      </button>
      <button
        type="button"
        onClick={() => {
          props.onPremiumChange?.(generatedPremium());
          props.onEditedChange?.(true);
        }}
      >
        Edit premium
      </button>
    </>
  ),
}));

const SHOW: Partial<Show> = {
  id: 'show-1',
  name: 'Fall Trial',
  status: 'draft',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  location: 'Expo Hall',
  entryOpenDate: '2026-10-01',
  entryCloseDate: '2026-10-24',
  preEntryFee: '30',
  dayOfShowFee: '35',
  isNationals: false,
};

const setup = () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const view = render(
    <ShowEditPanel
      open
      onClose={onClose}
      showId="show-1"
      showName="Fall Trial"
      initialShowData={SHOW}
      onSave={onSave}
    />
  );
  return { onSave, onClose, ...view };
};

const TITLE = 'Publish these premium changes?';

describe('Publish these premium changes? (MYK9-2201)', () => {
  it('does not ask when the premium was only loaded, not edited', async () => {
    const { onSave, user } = setup();
    await user.click(await screen.findByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Load premium' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('publishExperience');
  });

  it('asks when premium edits sit beside an unticked box, and Publish publishes them', async () => {
    const { onSave, user } = setup();
    await user.click(await screen.findByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit premium' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ publishExperience: true, generatedPremium: generatedPremium() })
    );
  });

  it('Discard saves the rest of the show without the premium', async () => {
    const { onSave, user } = setup();
    const name = await screen.findByLabelText(/show name/i);
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(screen.getByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit premium' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Discard premium changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = onSave.mock.calls[0]?.[0];
    expect(sent).toMatchObject({ name: 'Renamed' });
    expect(sent).not.toHaveProperty('generatedPremium');
    expect(sent).not.toHaveProperty('publishExperience');
  });

  it('closing the dialog saves nothing and keeps the panel open', async () => {
    const { onSave, onClose, user } = setup();
    await user.click(await screen.findByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit premium' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await screen.findByText(TITLE);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('Keep editing saves nothing and keeps the panel open', async () => {
    const { onSave, onClose, user } = setup();
    await user.click(await screen.findByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit premium' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Discard with no other edit runs no save, so it cannot touch the judges', async () => {
    const { onSave, user } = setup();
    await user.click(await screen.findByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit premium' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Discard premium changes' }));

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not ask when the publish box is ticked', async () => {
    const { onSave, user } = setup();
    await user.click(await screen.findByRole('tab', { name: /premium/i }));
    await user.click(await screen.findByRole('button', { name: 'Edit premium' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Generate exhibitor documents on save' })
    );
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ publishExperience: true }));
  });
});
