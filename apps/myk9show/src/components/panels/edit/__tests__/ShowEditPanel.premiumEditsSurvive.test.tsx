/**
 * MYK9-2236: premium text edits survive the two things that unmount the editor in Edit show:
 * a visit to another tab, and the form giving way to a skeleton while "Publish these premium
 * changes?" waits. The real editor and the real tabs render here; only data hooks are mocked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import type { Show } from '@/types/show-types';

const generateMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
// Never published: the editor generates its first premium.
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  usePublishedExperienceContent: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/features/premium/usePremiumFacts', () => ({
  usePremiumFacts: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: undefined }),
}));
vi.mock('@/features/premium/useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: generateMock,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/usePremiumGenerations', () => ({
  useLogPremiumGeneration: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/queries/usePremiumTemplates', () => ({
  useUpdatePremiumTemplate: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/features/premium/PremiumPdfDownloadLink', () => ({ default: () => null }));

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

const TITLE = 'Publish these premium changes?';

function setup(initialTab: 'premium' | 'venue' = 'premium') {
  generateMock.mockResolvedValue(generatedPremium());
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ShowEditPanel
      open
      onClose={vi.fn()}
      showId="show-1"
      showName="Fall Trial"
      initialShowData={SHOW}
      initialTab={initialTab}
      onSave={onSave}
    />
  );
  return { onSave, ...view };
}

async function editShowHours(user: ReturnType<typeof setup>['user']) {
  const hours = await screen.findByDisplayValue('Hours');
  await user.type(hours, ' edited');
  expect(screen.getByDisplayValue('Hours edited')).toBeInTheDocument();
}

describe('Edit show keeps premium edits when the editor unmounts (MYK9-2236)', () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('keeps the edit across a visit to another tab, without generating again', async () => {
    const { user } = setup();
    await editShowHours(user);

    await user.click(screen.getByRole('tab', { name: /basic info/i }));
    await waitFor(() => expect(screen.queryByDisplayValue('Hours edited')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /premium/i }));

    expect(await screen.findByDisplayValue('Hours edited')).toBeInTheDocument();
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('still asks at Save from another tab, and Publish sends the edit', async () => {
    const { onSave, user } = setup();
    await editShowHours(user);
    await user.click(screen.getByRole('tab', { name: /basic info/i }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        publishExperience: true,
        generatedPremium: expect.objectContaining({
          narratives: expect.objectContaining({ showHours: 'Hours edited' }),
        }),
      })
    );
  });

  it('Keep editing brings the edit back, without generating again', async () => {
    const { onSave, user } = setup();
    await editShowHours(user);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    expect(await screen.findByDisplayValue('Hours edited')).toBeInTheDocument();
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    // The restored edit is still an edit: Save asks again.
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
  });

  it('leaving an unedited premium leaves nothing to save, as before', async () => {
    const { user } = setup();
    await screen.findByDisplayValue('Hours');
    await user.click(screen.getByRole('tab', { name: /basic info/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
    );
  });

  it('opens on the Venue tab without mounting the editor', async () => {
    setup('venue');
    expect(await screen.findByRole('tab', { name: /venue/i, selected: true })).toBeInTheDocument();
    expect(screen.queryByText('Shared Show Content')).not.toBeInTheDocument();
    expect(generateMock).not.toHaveBeenCalled();
  });
});
