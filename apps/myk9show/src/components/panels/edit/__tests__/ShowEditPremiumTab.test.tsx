import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const premiumEditorProps: Array<{
  onPremiumChange?: (value: unknown) => void;
  onInkSaverChange?: (value: boolean) => void;
  style?: string;
  initialPremium?: unknown;
}> = [];
let publishedExperienceContentMock: unknown = null;

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));
vi.mock('@/features/premium/PremiumContentEditor', () => ({
  PremiumContentEditor: (props: {
    onPremiumChange?: (value: unknown) => void;
    onInkSaverChange?: (value: boolean) => void;
    style?: string;
    initialPremium?: unknown;
  }) => {
    premiumEditorProps.push(props);
    return <div data-testid="premium-content-editor" />;
  },
}));
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  usePublishedExperienceContent: () => ({ data: publishedExperienceContentMock, isLoading: false }),
}));

import { ShowEditPremiumTab } from '../ShowEditPremiumTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';

const baseData: ShowEditFormData = {
  id: 'show-1',
  name: 'Test Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'c1',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  location: 'Dogtown',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-04-15',
  preEntryFee: '15',
  dayOfShowFee: '20',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'monogram',
};

describe('ShowEditPremiumTab', () => {
  beforeEach(() => {
    premiumEditorProps.length = 0;
    publishedExperienceContentMock = null;
  });

  it('writes the selected experience style to the show style field', async () => {
    const user = userEvent.setup();
    const handleSelectChange = vi.fn(() => vi.fn());

    render(
      <ShowEditPremiumTab
        data={baseData}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={handleSelectChange}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    await user.click(screen.getByRole('radio', { name: /heritage/i }));

    expect(handleSelectChange).toHaveBeenCalledWith('style');
    expect(handleSelectChange.mock.results[0]?.value).toHaveBeenCalledWith('heritage');
  });

  it('renders the shared show content editor in the same tab as style selection', () => {
    render(
      <ShowEditPremiumTab
        data={baseData}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(screen.getByText('Show Experience Style')).toBeInTheDocument();
    expect(screen.getByText('Shared Show Content')).toBeInTheDocument();
    expect(screen.getByTestId('premium-content-editor')).toBeInTheDocument();
  });

  it('renders a Publish to Exhibitors checkbox for the full experience', () => {
    render(
      <ShowEditPremiumTab
        data={{ ...baseData, publishExperience: false }}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(screen.getByRole('checkbox', { name: /publish to exhibitors/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        /when you save, publish the premium list, landing page, entry form, and confirmation email/i
      )
    ).toBeInTheDocument();
  });

  it('passes stable premium editor callbacks and the selected style', () => {
    const handleValueChange = vi.fn(
      () => (_value: ShowEditFormData[keyof ShowEditFormData]) => undefined
    );
    const { rerender } = render(
      <ShowEditPremiumTab
        data={{ ...baseData, style: 'poster' }}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={handleValueChange}
      />
    );

    rerender(
      <ShowEditPremiumTab
        data={{ ...baseData, style: 'poster' }}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={handleValueChange}
      />
    );

    expect(premiumEditorProps[0]?.style).toBe('poster');
    expect(premiumEditorProps[1]?.onPremiumChange).toBe(premiumEditorProps[0]?.onPremiumChange);
    expect(premiumEditorProps[1]?.onInkSaverChange).toBe(premiumEditorProps[0]?.onInkSaverChange);
  });

  it('seeds shared content from the local published experience snapshot', () => {
    render(
      <ShowEditPremiumTab
        data={{
          ...baseData,
          style: 'poster',
          clubName: 'Test Club',
          experiencePublishedContent: {
            style: 'fieldGuide',
            generatedAt: '2026-05-09T14:00:00.000Z',
            narratives: {
              showHours: 'Published hours.',
              trialInformation: 'Published trial info.',
            },
            supplemental: {
              vetClinic: { name: 'Vet', address: '1 Main', phone: '555-0100' },
              accommodations: [],
              coverImageUrl: null,
              hospitalityNotes: 'Coffee.',
              awardsDescription: null,
              additionalNotes: null,
            },
            outputs: { premiumUrl: 'https://example.test/premium.pdf' },
          },
          trials: [
            {
              id: 'trial-1',
              name: 'Trial 1',
              date: '2026-05-01',
              trialNumber: '2026123401',
              status: 'published',
              trialType: 'Scent Work',
              classes: [{ id: 'class-1', name: 'Novice Container', level: 'Novice' }],
            },
          ],
        }}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(premiumEditorProps[0]?.initialPremium).toMatchObject({
      org: 'AKC',
      style: 'poster',
      club: { name: 'Test Club' },
      narratives: {
        showHours: 'Published hours.',
        trialInformation: 'Published trial info.',
      },
      supplemental: {
        vetClinic: { name: 'Vet', address: '1 Main', phone: '555-0100' },
      },
      trials: [{ name: 'Trial 1', eventNumber: '2026123401' }],
    });
  });

  it('seeds shared content from the fetched published snapshot when replication has not cached it', () => {
    publishedExperienceContentMock = {
      style: 'fieldGuide',
      generatedAt: '2026-05-09T14:00:00.000Z',
      narratives: {
        showHours: 'Fetched hours.',
        trialInformation: 'Fetched trial info.',
      },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: 'Bring water.',
      },
      outputs: { premiumUrl: 'https://example.test/premium.pdf' },
    };

    render(
      <ShowEditPremiumTab
        data={{ ...baseData, style: 'heritage', clubName: 'Test Club' }}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleSelectChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(premiumEditorProps[0]?.initialPremium).toMatchObject({
      style: 'heritage',
      narratives: {
        showHours: 'Fetched hours.',
        trialInformation: 'Fetched trial info.',
      },
      supplemental: {
        additionalNotes: 'Bring water.',
      },
    });
  });
});
