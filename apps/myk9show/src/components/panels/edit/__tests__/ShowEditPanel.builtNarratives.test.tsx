/**
 * MYK9-2280: through the real Edit show panel, "Use the show's current details" stays usable
 * when the premium draft loads or a premium-tab control changes, and is held only by a
 * narrative input Edit show can change (the show's name and location). The whole-form dirty flag
 * would fail the first two: it turns true when the editor loads its draft.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import { UNSAVED_SHOW_REASON } from '@/features/premium/BuiltNarrativeLink';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import type { Show } from '@/types/show-types';

const generateMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
// Published: the editor takes its draft from the server's facts.
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  usePublishedExperienceContent: () => ({
    data: fromAny({
      org: 'AKC',
      supplemental: generatedPremium().supplemental,
      narratives: generatedPremium().narratives,
    }),
    isLoading: false,
  }),
}));
vi.mock('@/features/premium/usePremiumFacts', () => ({
  usePremiumFacts: () => ({
    data: {
      ...generatedPremium(),
      builtNarratives: { showHours: 'Built hours', trialInformation: 'Built trial info' },
    },
    isLoading: false,
  }),
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

const LINK = /use the show's current details/i;

function setup() {
  return render(
    <ShowEditPanel
      open
      onClose={vi.fn()}
      showId="show-1"
      showName="Fall Trial"
      initialShowData={SHOW}
      initialTab="premium"
      onSave={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

describe("Use the show's current details inside Edit show (MYK9-2280)", () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('is enabled once the published draft loads under a narrative that differs', async () => {
    setup();
    const links = await screen.findAllByRole('button', { name: LINK });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toBeEnabled();
    expect(screen.queryByText(UNSAVED_SHOW_REASON)).not.toBeInTheDocument();
  });

  it('stays enabled after ticking "Generate exhibitor documents on save"', async () => {
    const { user } = setup();
    await screen.findAllByRole('button', { name: LINK });

    await user.click(
      screen.getByRole('checkbox', { name: 'Generate exhibitor documents on save' })
    );

    for (const link of screen.getAllByRole('button', { name: LINK })) expect(link).toBeEnabled();
  });

  it.each([
    ['name', 'Show name', ' renamed'],
    ['location', 'Location', ' annex'],
  ])('is held, with the reason, once the show %s changes', async (_key, label, typed) => {
    const { user } = setup();
    await screen.findAllByRole('button', { name: LINK });
    await user.click(screen.getByRole('tab', { name: /basic info/i }));
    await user.type(screen.getByLabelText(new RegExp(label, 'i')), typed);
    await user.click(screen.getByRole('tab', { name: /premium/i }));

    const links = await screen.findAllByRole('button', { name: LINK });
    for (const link of links) expect(link).toBeDisabled();
    expect(screen.getAllByText(UNSAVED_SHOW_REASON).length).toBeGreaterThan(0);
  });
});
