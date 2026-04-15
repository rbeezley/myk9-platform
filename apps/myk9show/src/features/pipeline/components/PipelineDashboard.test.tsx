import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import PipelineDashboard from './PipelineDashboard';

// Mock all hooks that make network calls
vi.mock('../hooks/useMissionControlData', () => ({
  useMissionControlData: () => ({
    isLoading: false,
    classesLoading: false,
    shows: [{ id: 'show-1', name: 'Test Show', startDate: '2026-06-01', endDate: '2026-06-01' }],
    selectedShow: {
      id: 'show-1',
      name: 'Test Show',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    },
    selectedTrial: null,
    trials: [],
    handleShowChange: vi.fn(),
    handleTrialChange: vi.fn(),
    classesByStage: new Map(),
    pipelineClasses: [],
    hasLiveClasses: false,
    showStats: null,
    trialStats: null,
  }),
}));

vi.mock('../hooks/useQuickActionStats', () => ({
  useQuickActionStats: () => ({
    pendingEntriesCount: 0,
    reportsReadyCount: 0,
    activeTrialsCount: 0,
  }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useUpdateClassMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/shows/cloning', () => ({
  ShowCloneDialog: () => null,
}));

vi.mock('./ShowContextRow', () => ({ ShowContextRow: () => null }));
vi.mock('./TrialContextRow', () => ({ TrialContextRow: () => null }));
vi.mock('./AnnouncementsCard', () => ({ AnnouncementsCard: () => null }));
vi.mock('./QuickActionsSection', () => ({ QuickActionsSection: () => null }));
vi.mock('./ShowSettingsPanel', () => ({ ShowSettingsPanel: () => null }));

describe('PipelineDashboard', () => {
  it('renders the New Show button in the header', () => {
    render(<PipelineDashboard />);
    expect(screen.getByRole('link', { name: /new show/i })).toBeInTheDocument();
  });

  it('New Show button links to the show creation wizard', () => {
    render(<PipelineDashboard />);
    const link = screen.getByRole('link', { name: /new show/i });
    expect(link).toHaveAttribute('href', '/secretary/create-show/wizard');
  });
});
