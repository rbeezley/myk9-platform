import { render as rtlRender, screen, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const premiumEditorProps: Array<{
  onPremiumChange?: (value: unknown) => void;
  onInkSaverChange?: (value: boolean) => void;
  style?: string;
  initialPremium?: unknown;
  regenerateBlockedReason?: string;
  deferGeneration?: boolean;
}> = [];
let publishedExperienceContentMock: unknown = null;
let officialsMock: unknown;
let premiumFactsMock: { data?: unknown; isLoading: boolean } = { isLoading: false };

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/features/premium/PremiumContentEditor', () => ({
  PremiumContentEditor: (props: {
    onPremiumChange?: (value: unknown) => void;
    onInkSaverChange?: (value: boolean) => void;
    style?: string;
    initialPremium?: unknown;
    deferGeneration?: boolean;
  }) => {
    premiumEditorProps.push(props);
    return <div data-testid="premium-content-editor" />;
  },
}));
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  usePublishedExperienceContent: () => ({ data: publishedExperienceContentMock, isLoading: false }),
}));

vi.mock('@/features/premium/usePremiumFacts', () => ({
  usePremiumFacts: () => premiumFactsMock,
}));

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: officialsMock }),
}));

import { ShowEditPremiumTab } from '../ShowEditPremiumTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';
import { buildExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { buildPremiumFacts } from '@/features/premium/premiumFacts';
import { NEW_YEAR_SHOW } from '@/test/fixtures/recordingFeeCalendar';
import type { GeneratedPremium } from '@/types/premium-types';
import { generatedPremium as baseGeneratedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import type { ShowTrial } from '@/types/show-types';

// The tab reads the query cache for its offline judge affiliations (MYK9-2292).
// One client per render, so a rerender keeps the cache (the router is mocked here, so the shared
// testUtils renderer, which mounts a MemoryRouter, does not fit this file).
const render = (ui: ReactElement, options?: RenderOptions) => {
  const client = new QueryClient();
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    ...options,
  });
};

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

// Every describe below reads these module-level mocks, so each test starts from the same state
// whatever order CI shuffles them into (a facts call left loading hands over no premium).
beforeEach(() => {
  premiumEditorProps.length = 0;
  publishedExperienceContentMock = null;
  officialsMock = undefined;
  premiumFactsMock = { isLoading: false };
});

describe('ShowEditPremiumTab', () => {
  it('links the settings surface to the canonical show Preview editor', () => {
    render(
      <ShowEditPremiumTab
        data={baseData}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(screen.getByRole('link', { name: /open show preview/i })).toHaveAttribute(
      'href',
      '/shows/show-1?preview=public&returnTo=%2Fshows%2Fshow-1%3Fedit%3Dtrue%26editTab%3Dpremium'
    );
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('renders the shared show content editor in the same tab as style selection', () => {
    render(
      <ShowEditPremiumTab
        data={baseData}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(screen.getByText('Show Experience Style')).toBeInTheDocument();
    expect(screen.getByText('Shared Show Content')).toBeInTheDocument();
    expect(screen.getByTestId('premium-content-editor')).toBeInTheDocument();
  });

  it('renders a Generate exhibitor documents on save checkbox for the full experience', () => {
    render(
      <ShowEditPremiumTab
        data={{ ...baseData, publishExperience: false }}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(
      screen.getByRole('checkbox', { name: /generate exhibitor documents on save/i })
    ).toBeInTheDocument();
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

  describe('online, the preview starts from the server facts (MYK9-2244)', () => {
    const published = {
      style: 'fieldGuide',
      generatedAt: '2026-05-09T14:00:00.000Z',
      narratives: { showHours: 'Edited hours.', trialInformation: 'Edited info.' },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        coverImageUrl: null,
        hospitalityNotes: 'Coffee.',
        awardsDescription: null,
        additionalNotes: null,
      },
      outputs: {},
    };
    const renderTab = () =>
      render(
        <ShowEditPremiumTab
          data={{ ...baseData, style: 'poster' }}
          clubId="c1"
          showOrg="AKC"
          isActive
          handleCheckboxChange={vi.fn(() => vi.fn())}
          handleValueChange={vi.fn(() => vi.fn())}
        />
      );

    it('hands the editor the server facts with only its own copy and style laid over them', () => {
      publishedExperienceContentMock = published;
      const facts = {
        ...baseGeneratedPremium(),
        templateId: 'club-template-1',
        show: { ...baseGeneratedPremium().show, address: '12 Pine Rd', maxTotalEntries: 60 },
      };
      premiumFactsMock = { data: facts, isLoading: false };

      renderTab();

      expect(premiumEditorProps.at(-1)?.initialPremium).toMatchObject({
        style: 'poster',
        // Detached from the club template, so a cover edit never rewrites it.
        templateId: null,
        show: { address: '12 Pine Rd', maxTotalEntries: 60 },
        narratives: facts.narratives,
        supplemental: { hospitalityNotes: 'Coffee.' },
      });
    });

    it('seeds the narratives from the server, so a blank published section is filled', () => {
      publishedExperienceContentMock = {
        ...published,
        narratives: { showHours: 'Edited hours.', trialInformation: '' },
      };
      const facts = {
        ...baseGeneratedPremium(),
        narratives: { showHours: 'Edited hours.', trialInformation: 'Built from the show.' },
      };
      premiumFactsMock = { data: facts, isLoading: false };

      renderTab();

      expect(premiumEditorProps.at(-1)?.initialPremium).toMatchObject({
        narratives: { showHours: 'Edited hours.', trialInformation: 'Built from the show.' },
      });
    });

    it('hands over nothing, and holds generation, until the facts call settles', () => {
      publishedExperienceContentMock = published;
      premiumFactsMock = { isLoading: true };

      renderTab();

      expect(premiumEditorProps.at(-1)?.initialPremium).toBeUndefined();
      expect(premiumEditorProps.at(-1)?.deferGeneration).toBe(true);
    });

    it('keeps the form-built draft when there are no server facts (offline or failed)', () => {
      publishedExperienceContentMock = published;
      premiumFactsMock = { data: undefined, isLoading: false };

      renderTab();

      expect(premiumEditorProps.at(-1)?.initialPremium).toMatchObject({
        org: 'AKC',
        show: { name: 'Test Show' },
        narratives: published.narratives,
      });
    });
  });

  describe('offline, judge affiliations (MYK9-2292)', () => {
    const judgeRoster = [
      { judgeId: 'j1', judgeName: 'Pat Judge', assignedDate: '2026-05-01' },
      { judgeId: 'j2', judgeName: 'Sam Judge', assignedDate: '2026-05-01' },
    ];
    const trial = {
      id: 't1',
      name: 'Saturday',
      date: '2026-05-01',
      classes: [],
    } as unknown as ShowTrial;
    const printedJudges = () =>
      (
        premiumEditorProps.at(-1)?.initialPremium as {
          trials: Array<{ judges: Array<{ name: string; affiliation: string | null }> }>;
        }
      ).trials[0]?.judges;
    const renderOffline = (queryClient: QueryClient) => {
      publishedExperienceContentMock = buildExperienceSnapshot({
        premium: baseGeneratedPremium(),
        premiumPath: null,
        premiumUrl: '',
      });
      premiumFactsMock = { data: undefined, isLoading: false };
      render(
        <ShowEditPremiumTab
          data={{ ...baseData, assignedJudges: judgeRoster, trials: [trial] }}
          clubId="c1"
          showOrg="ASCA"
          isActive
          handleCheckboxChange={vi.fn(() => vi.fn())}
          handleValueChange={vi.fn(() => vi.fn())}
        />,
        {
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          ),
        }
      );
    };

    it('prints the affiliation the last checklist read held, and nothing for a judge it lacks', () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(
        ['premiumJudgeAffiliations', 'show-1'],
        [{ id: 'j1', name: 'Pat Judge', affiliation: 'Region 4', canEdit: false }]
      );
      renderOffline(queryClient);
      expect(printedJudges()).toEqual([
        expect.objectContaining({ name: 'Pat Judge', affiliation: 'Region 4' }),
        expect.objectContaining({ name: 'Sam Judge', affiliation: null }),
      ]);
    });

    it('prints no affiliation when nothing is held locally', () => {
      renderOffline(new QueryClient());
      expect(printedJudges()?.map(judge => judge.affiliation)).toEqual([null, null]);
    });
  });

  it('lists the show officials as the preview secretary and chair (MYK9-2053)', () => {
    officialsMock = {
      secretaries: [
        {
          personId: 'p1',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          role: 'secretary',
        },
      ],
      chairmen: [
        { personId: 'p2', firstName: 'Bob', lastName: 'Jones', email: null, role: 'chairman' },
      ],
      stewards: [],
    };
    publishedExperienceContentMock = {
      style: 'fieldGuide',
      generatedAt: '2026-05-09T14:00:00.000Z',
      narratives: { showHours: 'h', trialInformation: 't' },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      outputs: {},
    };
    render(
      <ShowEditPremiumTab
        data={baseData}
        clubId="c1"
        showOrg="AKC"
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

    expect(premiumEditorProps.at(-1)?.initialPremium).toMatchObject({
      secretary: { name: 'Jane Smith', email: 'jane@test.com' },
      officials: { chairman: { name: 'Bob Jones' } },
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

describe('republishing an edited premium without Regenerate keeps the recording fee (MYK9-2044)', () => {
  const [eve, newYear] = NEW_YEAR_SHOW.trialDates;
  const SUPPLEMENTAL = {
    vetClinic: null,
    accommodations: [],
    coverImageUrl: null,
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  };
  const trial = (id: string, date: string, status = 'published'): ShowTrial => ({
    id,
    name: `Trial ${id}`,
    date,
    trialNumber: `AKC-${id}`,
    status,
    trialType: 'Scent Work',
    classes: [],
  });

  /** A premium published for a single-trial show on New Year's Eve, stating $4.50. */
  const PUBLISHED = buildExperienceSnapshot({
    premium: {
      org: 'AKC',
      style: 'monogram',
      show: { startDate: eve },
      trials: [{ date: eve }],
      narratives: { showHours: 'Doors at 7.', trialInformation: 'Bring water.' },
      supplemental: SUPPLEMENTAL,
    },
    premiumPath: 'show-1/artifact-1.pdf',
    premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-1.pdf',
  });

  /** Open the tab, change the wording the way the editor does, and publish as Save does. */
  function editAndRepublish(trials: ShowTrial[], showOrg: 'AKC' | 'UKC' = 'AKC') {
    const data: ShowEditFormData = {
      ...baseData,
      organization: showOrg,
      startDate: NEW_YEAR_SHOW.startDate,
      endDate: newYear,
      experiencePublishedContent: PUBLISHED,
      trials,
    };
    render(
      <ShowEditPremiumTab
        data={data}
        clubId="c1"
        showOrg={showOrg}
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );
    const draft = premiumEditorProps.at(-1)?.initialPremium as GeneratedPremium;
    const edited: GeneratedPremium = {
      ...draft,
      narratives: { ...draft.narratives, showHours: 'Doors at 6:30.' },
    };
    const premium = edited;
    const snapshot = buildExperienceSnapshot({
      premium,
      premiumPath: 'show-1/artifact-2.pdf',
      premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-2.pdf',
    });
    return { premium, snapshot };
  }

  it('starts from a published snapshot that states the line', () => {
    expect(PUBLISHED.recordingFee).toBe('AKC recording fee: $4.50 per entry');
  });

  it('keeps the line in the PDF data and in the published snapshot', () => {
    const { premium, snapshot } = editAndRepublish([trial('1', eve)]);

    expect(premium.narratives.showHours).toBe('Doors at 6:30.');
    expect(buildPremiumFacts(premium).recordingFee).toBe('AKC recording fee: $4.50 per entry');
    expect(snapshot.recordingFee).toBe('AKC recording fee: $4.50 per entry');
  });

  it('states the new rate when the trial moved across a rate change after publishing', () => {
    const { premium, snapshot } = editAndRepublish([trial('1', newYear)]);

    expect(buildPremiumFacts(premium).recordingFee).toBe('AKC recording fee: $5.50 per entry');
    expect(snapshot.recordingFee).toBe('AKC recording fee: $5.50 per entry');
  });

  it('states no line once the show is no longer AKC', () => {
    const { premium, snapshot } = editAndRepublish([trial('1', eve)], 'UKC');

    expect(buildPremiumFacts(premium).recordingFee).toBeNull();
    expect(snapshot.recordingFee).toBeNull();
  });

  it('neither prints nor prices a cancelled trial', () => {
    const { premium, snapshot } = editAndRepublish([
      trial('1', eve),
      trial('2', newYear, 'cancelled'),
    ]);

    expect(premium.trials.map(t => t.date)).toEqual([eve]);
    expect(snapshot.recordingFee).toBe('AKC recording fee: $4.50 per entry');
  });

  it('neither prints nor prices a soft-deleted trial read from the server row (MYK9-2186)', () => {
    const mapped = mapDatabaseToShow({
      id: 'show-1',
      trials: [
        { id: '1', name: 'Trial 1', date: eve, status: 'upcoming', deleted_at: null },
        {
          id: '2',
          name: 'Trial 2',
          date: newYear,
          status: 'upcoming',
          deleted_at: '2026-11-01T00:00:00Z',
        },
      ],
    } as unknown as Parameters<typeof mapDatabaseToShow>[0]);
    const { premium, snapshot } = editAndRepublish(mapped.trials as ShowTrial[]);

    expect(premium.trials.map(t => t.date)).toEqual([eve]);
    expect(snapshot.recordingFee).toBe('AKC recording fee: $4.50 per entry');
  });

  it('states both rates for a live New Year pair', () => {
    const { snapshot } = editAndRepublish([trial('1', eve), trial('2', newYear)]);

    expect(snapshot.recordingFee).toBe(
      'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027'
    );
  });
});

describe('ShowEditPremiumTab unsaved organization (MYK9-2213)', () => {
  beforeEach(() => {
    premiumEditorProps.length = 0;
  });

  const renderTab = (showOrg: 'AKC' | 'UKC', savedOrganization: string) =>
    render(
      <ShowEditPremiumTab
        data={{ ...baseData, organization: showOrg }}
        clubId="c1"
        showOrg={showOrg}
        savedOrganization={savedOrganization}
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );

  it('holds Regenerate and names the saved organization while the form differs', () => {
    renderTab('UKC', 'AKC');
    expect(premiumEditorProps.at(-1)).toMatchObject({
      regenerateBlockedReason:
        'Save the show first. Regenerate builds from the saved organization (AKC).',
    });
  });

  it('does not hold Regenerate when the form matches the saved organization', () => {
    renderTab('AKC', 'AKC');
    expect(premiumEditorProps.at(-1)?.regenerateBlockedReason).toBeUndefined();
  });
});

describe('ShowEditPremiumTab entry limit (MYK9-2220)', () => {
  const snapshot = buildExperienceSnapshot({
    premium: {
      org: 'UKC',
      style: 'monogram',
      show: { startDate: '2026-05-01' },
      trials: [],
      narratives: { showHours: 'Doors at 7.', trialInformation: 'Bring water.' },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
    },
    premiumPath: 'show-1/artifact-1.pdf',
    premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-1.pdf',
  });

  const draftShow = (maxTotalEntries?: number) => {
    render(
      <ShowEditPremiumTab
        data={{
          ...baseData,
          organization: 'UKC',
          experiencePublishedContent: snapshot,
          ...(maxTotalEntries === undefined ? {} : { maxTotalEntries }),
        }}
        clubId="c1"
        showOrg="UKC"
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={vi.fn(() => vi.fn())}
      />
    );
    return (premiumEditorProps.at(-1)?.initialPremium as GeneratedPremium).show;
  };

  it('the edit draft carries the show limit, and none when the show has no limit', () => {
    expect(draftShow(80).maxTotalEntries).toBe(80);
    expect(draftShow().maxTotalEntries).toBeNull();
  });
});

describe('ShowEditPremiumTab ASCA show details (MYK9-2290)', () => {
  const render_ = (showOrg: 'AKC' | 'UKC' | 'ASCA', data: ShowEditFormData = baseData) => {
    const setters = new Map<string, ReturnType<typeof vi.fn>>();
    const handleValueChange = vi.fn((field: string) => {
      const setter = vi.fn();
      setters.set(field, setter);
      return setter;
    });
    render(
      <ShowEditPremiumTab
        data={data}
        clubId="c1"
        showOrg={showOrg}
        isActive
        handleCheckboxChange={vi.fn(() => vi.fn())}
        handleValueChange={handleValueChange as never}
      />
    );
    return setters;
  };

  it.each(['AKC', 'UKC'] as const)('is not shown for a %s show', org => {
    render_(org);
    expect(screen.queryByText('ASCA Show Details')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/scents used for each level/i)).not.toBeInTheDocument();
  });

  it('shows the four facts for an ASCA show, filled from the show', () => {
    render_('ASCA', {
      ...baseData,
      organization: 'ASCA',
      scentsByLevel: 'Novice birch',
      photographerContact: 'Pat',
      ascaSanctionStatus: 'approved',
      spectatorsPolicy: 'not_allowed',
    });
    expect(screen.getByText('ASCA Show Details')).toBeInTheDocument();
    expect(screen.getByLabelText(/scents used for each level/i)).toHaveValue('Novice birch');
    expect(screen.getByLabelText(/show photographer contact/i)).toHaveValue('Pat');
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
  });

  it('reports typing into the form', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const setters = render_('ASCA', { ...baseData, organization: 'ASCA' });
    await userEvent.type(screen.getByLabelText(/scents used for each level/i), 'B');
    await userEvent.type(screen.getByLabelText(/show photographer contact/i), 'P');
    expect(setters.get('scentsByLevel')).toHaveBeenCalledWith('B');
    expect(setters.get('photographerContact')).toHaveBeenCalledWith('P');
  });

  it('the offline draft prints the unsaved facts', () => {
    const snapshot = buildExperienceSnapshot({
      premium: {
        org: 'ASCA',
        style: 'monogram',
        show: { startDate: '2026-05-01' },
        trials: [],
        narratives: { showHours: 'Doors at 7.', trialInformation: 'Bring water.' },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: null,
          hospitalityNotes: null,
          awardsDescription: null,
          additionalNotes: null,
        },
      },
      premiumPath: 'show-1/artifact-1.pdf',
      premiumUrl: 'https://trusted.example/premium-published/show-1/artifact-1.pdf',
    });
    render_('ASCA', {
      ...baseData,
      organization: 'ASCA',
      scentsByLevel: 'Birch',
      experiencePublishedContent: snapshot,
    });
    const show = (premiumEditorProps.at(-1)?.initialPremium as GeneratedPremium).show;
    expect(show.scentsByLevel).toBe('Birch');
    expect(show.ascaSanctionStatus).toBeNull();
  });
});
