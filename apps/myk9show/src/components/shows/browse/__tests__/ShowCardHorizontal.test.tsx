import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ShowCardHorizontal, ShowCardHorizontalSkeleton } from '../ShowCardHorizontal';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock show-actions
vi.mock('@/utils/show-actions', () => ({
  getShowActions: vi.fn().mockReturnValue([]),
}));

// Mock permissionValidation (used by show-actions internally)
vi.mock('@/utils/permissionValidation', () => ({
  ShowPermissionValidator: {
    auditAction: vi.fn(),
    canView: vi.fn().mockReturnValue(true),
    canRegister: vi.fn().mockReturnValue(false),
  },
}));

// Mock LoggingService
vi.mock('@/services/LoggingService', () => ({
  logger: {
    logUserAction: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getShowActions } from '@/utils/show-actions';

// Helper to create a minimal EnhancedShow for testing
function createMockShow(overrides: Partial<EnhancedShow> = {}): EnhancedShow {
  return {
    id: 'show-1',
    name: 'Spring Agility Trial',
    organization: 'Agility',
    startDate: '2026-04-15',
    endDate: '2026-04-17',
    location: 'Denver, CO',
    status: 'upcoming',
    events: ['Agility', 'Rally'],
    source: 'myK9Show',
    entryOpenDate: '2026-03-01',
    entryCloseDate: '2026-04-10',
    preEntryFee: '30',
    clubId: 'club-1',
    clubName: 'Rocky Mountain Agility Club',
    clubAddress: '123 Main St',
    clubEmail: 'info@rmac.org',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    chairman: 'Jane Doe',
    secretary: 'John Smith',
    chiefSteward: 'Bob Wilson',
    assignedJudges: [],
    stats: [],
    trials: [
      {
        id: 't1',
        name: 'Saturday Trial',
        date: '2026-04-15',
        trialNumber: '1',
        status: 'upcoming',
      },
      {
        id: 't2',
        name: 'Sunday Trial',
        date: '2026-04-16',
        trialNumber: '2',
        status: 'upcoming',
      },
    ],
    relationship: ['all'],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: false,
    ...overrides,
  };
}

function createMockEntry(
  showId: string,
  overrides: Partial<SyncableShowEntry> = {}
): SyncableShowEntry {
  return {
    id: `entry-${showId}`,
    showId,
    classId: 'class-1',
    dogId: 'dog-1',
    status: 'submitted',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Test Handler',
      entryFee: 30,
      paymentStatus: 'paid',
    },
    competitionData: undefined,
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'user-1',
    _syncStatus: 'synced',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (getShowActions as ReturnType<typeof vi.fn>).mockReturnValue([]);
});

describe('ShowCardHorizontal', () => {
  it('renders show title, club name, and location', () => {
    const show = createMockShow();
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
    expect(screen.getByText('Rocky Mountain Agility Club')).toBeInTheDocument();
    expect(screen.getByText('Denver, CO')).toBeInTheDocument();
  });

  it('renders DateCircle with correct dates', () => {
    const show = createMockShow();
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    // DateCircle renders month and day
    expect(screen.getByText('APR')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders discipline tags from show.events', () => {
    const show = createMockShow({ events: ['Agility', 'Rally', 'Obedience'] });
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    // Organization badge for 'Agility' is rendered via getTypeBadge
    // Other events rendered as discipline tags
    expect(screen.getByText('Rally')).toBeInTheDocument();
    expect(screen.getByText('Obedience')).toBeInTheDocument();
  });

  it('renders organization badge', () => {
    const show = createMockShow({ organization: 'Agility' });
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    // getTypeBadge renders organization in uppercase
    expect(screen.getByText('AGILITY')).toBeInTheDocument();
  });

  it('renders entry status badge via EntryStatusBadge', () => {
    // Set entry close date far in the future so status is 'accepting'
    const show = createMockShow({
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2027-12-31',
    });
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    // EntryStatusBadge with userHasEntries=false and accepting status
    expect(screen.getByText('Accepting Entries')).toBeInTheDocument();
  });

  it('shows entry count badge when user has entries', () => {
    const show = createMockShow();
    const entries = [createMockEntry('show-1'), createMockEntry('show-1', { id: 'entry-2' })];

    render(<ShowCardHorizontal show={show} entries={entries} selectedTab="all" user={null} />);

    expect(screen.getByText('2 entries')).toBeInTheDocument();
  });

  it('shows singular "entry" for single entry', () => {
    const show = createMockShow();
    const entries = [createMockEntry('show-1')];

    render(<ShowCardHorizontal show={show} entries={entries} selectedTab="all" user={null} />);

    expect(screen.getByText('1 entry')).toBeInTheDocument();
  });

  it('click navigates to /shows/{id}', () => {
    const show = createMockShow({ id: 'show-abc' });
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    // Click on the card container
    const card = screen.getByText('Spring Agility Trial').closest('[data-testid="show-card"]');
    expect(card).toBeInTheDocument();
    fireEvent.click(card!);
    expect(mockNavigate).toHaveBeenCalledWith('/shows/show-abc');
  });

  it('shows checkbox when onToggleSelect provided', () => {
    const show = createMockShow();
    const onToggle = vi.fn();

    render(
      <ShowCardHorizontal
        show={show}
        entries={[]}
        selectedTab="all"
        user={null}
        onToggleSelect={onToggle}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /select spring agility trial/i });
    expect(checkbox).toBeInTheDocument();
  });

  it('does not show checkbox when onToggleSelect is not provided', () => {
    const show = createMockShow();
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('applies ring-2 when isSelected is true', () => {
    const show = createMockShow();
    render(
      <ShowCardHorizontal
        show={show}
        entries={[]}
        selectedTab="all"
        user={null}
        isSelected={true}
        onToggleSelect={vi.fn()}
      />
    );

    const card = screen.getByTestId('show-card');
    expect(card.className).toContain('ring-2');
  });

  it('does not apply ring-2 when isSelected is false', () => {
    const show = createMockShow();
    render(
      <ShowCardHorizontal
        show={show}
        entries={[]}
        selectedTab="all"
        user={null}
        isSelected={false}
      />
    );

    const card = screen.getByTestId('show-card');
    expect(card.className).not.toContain('ring-2');
  });

  it('handles show with empty events array (no crash)', () => {
    const show = createMockShow({ events: [] });
    expect(() => {
      render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);
    }).not.toThrow();

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('handles show with 0 trials', () => {
    const show = createMockShow({ trials: [] });
    expect(() => {
      render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);
    }).not.toThrow();

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('renders action buttons from getShowActions', () => {
    const mockAction = {
      id: 'view',
      label: 'View Details',
      icon: 'Eye',
      variant: 'default' as const,
      onClick: vi.fn(),
    };
    (getShowActions as ReturnType<typeof vi.fn>).mockReturnValue([mockAction]);

    const show = createMockShow();
    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('renders Enter button when entries are accepting and user is logged in', () => {
    const show = createMockShow({
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2027-12-31',
    });
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      roles: [],
      permissions: [],
      scopes: [],
    };

    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={user} />);

    expect(screen.getByText('Enter')).toBeInTheDocument();
  });

  it('renders closing soon urgency badge', () => {
    // Set entry close date to 2 days from now
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const show = createMockShow({
      entryOpenDate: '2026-01-01',
      entryCloseDate: twoDaysFromNow.toISOString().split('T')[0],
    });

    render(<ShowCardHorizontal show={show} entries={[]} selectedTab="all" user={null} />);

    expect(screen.getByText('2d left')).toBeInTheDocument();
  });
});

describe('ShowCardHorizontalSkeleton', () => {
  it('renders without crashing', () => {
    expect(() => {
      render(<ShowCardHorizontalSkeleton />);
    }).not.toThrow();
  });

  it('has animate-pulse class', () => {
    const { container } = render(<ShowCardHorizontalSkeleton />);
    const pulsingElements = container.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });
});
