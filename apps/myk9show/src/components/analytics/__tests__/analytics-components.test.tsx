import React from 'react';
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';

// Mock Recharts ResponsiveContainer to avoid SVG layout issues in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

import { StatsSummaryCards, StatsSummaryCardsSkeleton } from '../StatsSummaryCards';
import { ResultDistributionChart } from '../ResultDistributionChart';
import { DogBreakdownCards } from '../DogBreakdownCards';
import { FastestTimesTable } from '../FastestTimesTable';
import { QualificationTrendChart } from '../QualificationTrendChart';
import type {
  SummaryStats,
  ResultDistributionItem,
  DogStats,
  FastestTimeEntry,
  TrendPoint,
} from '../analytics-utils';

// ── Mock Data ────────────────────────────────────────────────────────

const mockSummary: SummaryStats = {
  totalEntries: 20,
  scoredEntries: 18,
  qualifiedCount: 12,
  qualificationRate: 0.67,
  bestTime: 85.43,
  bestTimeDogName: 'Rex',
  avgTime: 102.5,
  medianTime: 98.2,
};

const mockDistribution: ResultDistributionItem[] = [
  { status: 'Q', label: 'Qualified', count: 12, color: '#10b981' },
  { status: 'NQ', label: 'Not Qualified', count: 6, color: '#ef4444' },
];

const mockDogs: DogStats[] = [
  {
    dogId: 'dog-1',
    dogCallName: 'Rex',
    entries: 10,
    qualifiedCount: 10,
    qualificationRate: 1.0,
    bestTime: 85.43,
    avgTime: 95.2,
    isCleanSweep: true,
  },
  {
    dogId: 'dog-2',
    dogCallName: 'Bella',
    entries: 8,
    qualifiedCount: 4,
    qualificationRate: 0.5,
    bestTime: 92.1,
    avgTime: 110.5,
    isCleanSweep: false,
  },
];

const mockTimes: FastestTimeEntry[] = [
  {
    rank: 1,
    id: 'e-1',
    dogCallName: 'Rex',
    className: 'Agility 1',
    classElement: 'Agility',
    classLevel: 'Level 1',
    searchTimeSeconds: 85.43,
    showName: 'Spring Show',
  },
  {
    rank: 2,
    id: 'e-2',
    dogCallName: 'Bella',
    className: 'Agility 1',
    classElement: 'Agility',
    classLevel: 'Level 1',
    searchTimeSeconds: 92.1,
    showName: 'Spring Show',
  },
  {
    rank: 3,
    id: 'e-3',
    dogCallName: 'Max',
    className: 'Agility 2',
    classElement: 'Agility',
    classLevel: 'Level 2',
    searchTimeSeconds: 95.0,
    showName: 'Summer Show',
  },
  {
    rank: 4,
    id: 'e-4',
    dogCallName: 'Daisy',
    className: 'Agility 2',
    classElement: 'Agility',
    classLevel: 'Level 2',
    searchTimeSeconds: 99.3,
    showName: 'Summer Show',
  },
];

const mockTrend: TrendPoint[] = [
  {
    showId: 's-1',
    showName: 'Spring Show',
    showDate: '2025-03-15',
    totalEntries: 10,
    qualifiedCount: 7,
    qualificationRate: 0.7,
  },
  {
    showId: 's-2',
    showName: 'Summer Show',
    showDate: '2025-06-20',
    totalEntries: 8,
    qualifiedCount: 5,
    qualificationRate: 0.625,
  },
];

// ── StatsSummaryCards ────────────────────────────────────────────────

describe('StatsSummaryCards', () => {
  it('renders 4 stat cards with correct titles', () => {
    render(<StatsSummaryCards stats={mockSummary} />);
    // StatCard renders titles with CSS uppercase — DOM text is lowercase
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Q Rate')).toBeInTheDocument();
    expect(screen.getByText('Best Time')).toBeInTheDocument();
    expect(screen.getByText('Avg Time')).toBeInTheDocument();
  });

  it('renders correct values', () => {
    render(<StatsSummaryCards stats={mockSummary} />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('1:25.43')).toBeInTheDocument();
  });

  it('renders subtitles', () => {
    render(<StatsSummaryCards stats={mockSummary} />);
    expect(screen.getByText('18 of 20 scored')).toBeInTheDocument();
    expect(screen.getByText('12 of 18 qualified')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });
});

describe('StatsSummaryCardsSkeleton', () => {
  it('renders without error', () => {
    const { container } = render(<StatsSummaryCardsSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

// ── ResultDistributionChart ──────────────────────────────────────────

describe('ResultDistributionChart', () => {
  it('returns null for empty data', () => {
    const { container } = render(<ResultDistributionChart data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders card with title for non-empty data', () => {
    render(<ResultDistributionChart data={mockDistribution} />);
    expect(screen.getByText('Result Distribution')).toBeInTheDocument();
  });
});

// ── DogBreakdownCards ────────────────────────────────────────────────

describe('DogBreakdownCards', () => {
  it('renders dog names', () => {
    render(<DogBreakdownCards dogs={mockDogs} />);
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('renders "Performance by Dog" title', () => {
    render(<DogBreakdownCards dogs={mockDogs} />);
    expect(screen.getByText('Performance by Dog')).toBeInTheDocument();
  });

  it('shows trophy icon for clean sweep dogs', () => {
    render(<DogBreakdownCards dogs={mockDogs} />);
    const trophies = document.querySelectorAll('[title="Clean sweep - all qualified!"]');
    expect(trophies).toHaveLength(1);
  });

  it('returns null for empty dogs', () => {
    const { container } = render(<DogBreakdownCards dogs={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// ── FastestTimesTable ────────────────────────────────────────────────

describe('FastestTimesTable', () => {
  it('renders correct number of rows', () => {
    render(<FastestTimesTable times={mockTimes} />);
    const rows = document.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
  });

  it('shows medal emojis for top 3', () => {
    render(<FastestTimesTable times={mockTimes} />);
    expect(screen.getByText('\uD83E\uDD47')).toBeInTheDocument();
    expect(screen.getByText('\uD83E\uDD48')).toBeInTheDocument();
    expect(screen.getByText('\uD83E\uDD49')).toBeInTheDocument();
  });

  it('shows numeric rank for 4th place', () => {
    render(<FastestTimesTable times={mockTimes} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows Show column when showShowColumn is true', () => {
    render(<FastestTimesTable times={mockTimes} showShowColumn />);
    expect(screen.getByText('Show')).toBeInTheDocument();
    expect(screen.getAllByText('Spring Show').length).toBeGreaterThan(0);
  });

  it('hides Show column by default', () => {
    render(<FastestTimesTable times={mockTimes} />);
    expect(screen.queryByText('Show')).not.toBeInTheDocument();
  });

  it('returns null for empty times', () => {
    const { container } = render(<FastestTimesTable times={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// ── QualificationTrendChart ──────────────────────────────────────────

describe('QualificationTrendChart', () => {
  it('returns null for empty data', () => {
    const { container } = render(<QualificationTrendChart data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders card with title for non-empty data', () => {
    render(<QualificationTrendChart data={mockTrend} />);
    expect(screen.getByText('Qualification Trend')).toBeInTheDocument();
  });
});
