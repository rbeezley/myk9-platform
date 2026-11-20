import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import { showToFormData } from '../ShowEditPanel.helpers';
import { ShowEditPremiumTab } from '../ShowEditPremiumTab';

// MYK9-2285: a show that has never published a premium carries the column default
// `experience_published_content = '{}'`. The real editor renders here (not a mock) because the
// crash was its first render reading narratives off that empty object.

const generateMock = vi.hoisted(() => vi.fn(() => new Promise(() => undefined)));

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));
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
// Unpublished: the published-content read answers null, and no facts call is made.
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  usePublishedExperienceContent: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/features/premium/usePremiumFacts', () => ({
  usePremiumFacts: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: undefined }),
}));

function neverPublishedDraft() {
  const show = mapDatabaseToShow({
    id: 'draft-1',
    name: 'Never published draft',
    status: 'draft',
    organization: 'AKC',
    club_id: 'c1',
    start_date: '2026-12-05',
    end_date: '2026-12-05',
    trials: [],
    experience_is_published: false,
    experience_published_content: {},
  } as unknown as Parameters<typeof mapDatabaseToShow>[0]);
  return showToFormData(show);
}

describe('ShowEditPremiumTab on a never-published draft (MYK9-2285)', () => {
  it('maps the empty published-content column to no snapshot', () => {
    expect(neverPublishedDraft().experiencePublishedContent).toBeNull();
  });

  it('opens the editor in its generate state instead of crashing', () => {
    render(
      <ShowEditPremiumTab
        data={neverPublishedDraft()}
        clubId="c1"
        showOrg="AKC"
        savedOrganization="AKC"
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(screen.getByText('Shared Show Content')).toBeInTheDocument();
    expect(screen.getByText(/Building from the show details/i)).toBeInTheDocument();
    expect(generateMock).toHaveBeenCalledWith('draft-1');
  });
});
