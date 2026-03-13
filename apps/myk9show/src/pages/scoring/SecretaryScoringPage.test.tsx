import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SecretaryScoringPage } from './SecretaryScoringPage';
import type { ScoreData, EntryScoresheetProps } from '@myk9/scoring-ui';

// Mock replicated tables
const mockGetClassById = vi.fn();
const mockGetTrialById = vi.fn();
const mockGetEntriesByClass = vi.fn();
const mockGetDog = vi.fn();

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: (...args: unknown[]) => mockGetClassById(...args) },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: (...args: unknown[]) => mockGetTrialById(...args) },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: (...args: unknown[]) => mockGetEntriesByClass(...args),
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: (...args: unknown[]) => mockGetDog(...args) },
}));

// Mock useOptimisticScoring
const mockSubmitScore = vi.fn();
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({
    submitScoreOptimistically: mockSubmitScore,
    isSyncing: false,
    hasError: false,
    error: null,
    retryCount: 0,
    clearError: vi.fn(),
  }),
}));

// Mock logger
vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Track what getScoresheetComponent returns
let mockEntryComponent: React.ComponentType<EntryScoresheetProps> | null = null;

vi.mock('@myk9/scoring-ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@myk9/scoring-ui');
  return {
    ...actual,
    getScoresheetComponent: (_sportType: string, mode: string) => {
      if (mode === 'entry') return mockEntryComponent;
      return null;
    },
    buildResolvedClassRules: () => ({
      areaCount: 1,
      timerMode: 'single',
      maxTimeSeconds: 180,
      hideCount: 3,
      hidesKnown: true,
      distractionCount: 0,
    }),
  };
});

// Navigate mock
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test data factories
function createMockClass(overrides = {}) {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    level: 'Novice',
    trialId: 'trial-1',
    timeLimitSeconds: 180,
    ...overrides,
  };
}

function createMockTrial(overrides = {}) {
  return {
    id: 'trial-1',
    sportType: 'akc-scent-work',
    ...overrides,
  };
}

function createMockEntry(id: string, overrides = {}) {
  return {
    id,
    classId: 'class-1',
    dogId: `dog-${id}`,
    handler: 'Jane Handler',
    armband: '101',
    runOrder: parseInt(id, 10),
    status: 'pending',
    ...overrides,
  };
}

function createMockDog(id: string, overrides = {}) {
  return {
    id,
    callName: `Dog${id}`,
    name: `Dog${id}`,
    breed: 'Labrador',
    ...overrides,
  };
}

function renderPage(entryId = '1') {
  return render(
    <MemoryRouter initialEntries={[`/scoring/secretary/classes/class-1/entries/${entryId}`]}>
      <Routes>
        <Route
          path="/scoring/secretary/classes/:classId/entries/:entryId"
          element={<SecretaryScoringPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('SecretaryScoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntryComponent = null;

    // Default data setup
    mockGetClassById.mockResolvedValue(createMockClass());
    mockGetTrialById.mockResolvedValue(createMockTrial());
    mockGetEntriesByClass.mockResolvedValue([createMockEntry('1'), createMockEntry('2')]);
    mockGetDog.mockImplementation((id: string) =>
      Promise.resolve(createMockDog(id.replace('dog-', '')))
    );
  });

  it('renders loading state while fetching', () => {
    // Make loading take forever
    mockGetClassById.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders correct EntryScoresheet for sport type', async () => {
    const FakeEntryScoresheet = (props: EntryScoresheetProps) => (
      <div data-testid="entry-scoresheet">
        <span data-testid="dog-name">{props.entry.dogName}</span>
      </div>
    );
    mockEntryComponent = FakeEntryScoresheet;

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('entry-scoresheet')).toBeInTheDocument();
    });

    expect(screen.getByTestId('dog-name')).toHaveTextContent('Dog1');
  });

  it('passes entry, classInfo, rules as props', async () => {
    let capturedProps: EntryScoresheetProps | null = null;
    const FakeEntryScoresheet = (props: EntryScoresheetProps) => {
      // eslint-disable-next-line react-hooks/globals -- test prop capture pattern
      capturedProps = props;
      return <div data-testid="entry-scoresheet" />;
    };
    mockEntryComponent = FakeEntryScoresheet;

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('entry-scoresheet')).toBeInTheDocument();
    });

    expect(capturedProps).not.toBeNull();
    expect(capturedProps!.entry.armband).toBe(101);
    expect(capturedProps!.entry.handlerName).toBe('Jane Handler');
    expect(capturedProps!.classInfo.level).toContain('Novice');
    expect(capturedProps!.rules.areaCount).toBe(1);
    expect(capturedProps!.rules.maxTimeSeconds).toBe(180);
  });

  it('calls submitScoreOptimistically on submit', async () => {
    let capturedOnSubmit: ((data: ScoreData) => void) | null = null;
    const FakeEntryScoresheet = (props: EntryScoresheetProps) => {
      // eslint-disable-next-line react-hooks/globals -- test prop capture pattern
      capturedOnSubmit = props.onSubmit as (data: ScoreData) => void;
      return <div data-testid="entry-scoresheet" />;
    };
    mockEntryComponent = FakeEntryScoresheet;

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('entry-scoresheet')).toBeInTheDocument();
    });

    const scoreData: ScoreData = {
      resultText: 'Q',
      searchTime: '1:30.00',
      areas: {},
      areaTimes: [],
      correctCount: 3,
      incorrectCount: 0,
      faultCount: 0,
      finishCallErrors: 0,
      points: 0,
    };

    capturedOnSubmit!(scoreData);

    await waitFor(() => {
      expect(mockSubmitScore).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: 1,
          classId: expect.any(Number),
          scoreData: expect.objectContaining({
            resultText: 'Q',
            searchTime: '1:30.00',
          }),
        })
      );
    });
  });

  it('navigates to next entry on onNext', async () => {
    let capturedOnNext: (() => void) | undefined;
    const FakeEntryScoresheet = (props: EntryScoresheetProps) => {
      // eslint-disable-next-line react-hooks/globals -- test prop capture pattern
      capturedOnNext = props.onNext;
      return <div data-testid="entry-scoresheet" />;
    };
    mockEntryComponent = FakeEntryScoresheet;

    renderPage('1');

    await waitFor(() => {
      expect(screen.getByTestId('entry-scoresheet')).toBeInTheDocument();
    });

    expect(capturedOnNext).toBeDefined();
    capturedOnNext!();

    expect(mockNavigate).toHaveBeenCalledWith('/scoring/secretary/classes/class-1/entries/2');
  });

  it('calls onBack to navigate to entry list', async () => {
    let capturedOnBack: (() => void) | undefined;
    const FakeEntryScoresheet = (props: EntryScoresheetProps) => {
      // eslint-disable-next-line react-hooks/globals -- test prop capture pattern
      capturedOnBack = props.onBack;
      return <div data-testid="entry-scoresheet" />;
    };
    mockEntryComponent = FakeEntryScoresheet;

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('entry-scoresheet')).toBeInTheDocument();
    });

    capturedOnBack!();

    expect(mockNavigate).toHaveBeenCalledWith('/scoring/secretary/classes/class-1/entries');
  });

  it('shows error state when entry not found', async () => {
    mockGetEntriesByClass.mockResolvedValue([createMockEntry('99')]);

    renderPage('1');

    await waitFor(() => {
      expect(screen.getByText('Entry not found')).toBeInTheDocument();
    });

    expect(screen.getByText('Back to Entry List')).toBeInTheDocument();
  });

  it('shows error state when class not found', async () => {
    mockGetClassById.mockResolvedValue(null);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Class not found')).toBeInTheDocument();
    });
  });

  it('shows fallback when sport type has no entry scoresheet', async () => {
    mockEntryComponent = null;

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Entry Scoresheet Not Available')).toBeInTheDocument();
    });
  });

  it('does not provide onNext when on last entry', async () => {
    let capturedOnNext: (() => void) | undefined;
    const FakeEntryScoresheet = (props: EntryScoresheetProps) => {
      // eslint-disable-next-line react-hooks/globals -- test prop capture pattern
      capturedOnNext = props.onNext;
      return <div data-testid="entry-scoresheet" />;
    };
    mockEntryComponent = FakeEntryScoresheet;

    // Render the last entry
    renderPage('2');

    await waitFor(() => {
      expect(screen.getByTestId('entry-scoresheet')).toBeInTheDocument();
    });

    expect(capturedOnNext).toBeUndefined();
  });
});
