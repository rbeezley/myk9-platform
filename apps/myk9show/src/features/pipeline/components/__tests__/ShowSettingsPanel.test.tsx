import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowSettingsPanel } from '../ShowSettingsPanel';

// Mock React Query hooks used by ShowSettingsPanel
vi.mock('@/hooks/queries/useVisibilitySettings', () => ({
  useVisibilitySettings: () => ({
    data: null,
    isLoading: false,
  }),
  getDefaultShowSettings: () => ({
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'immediate',
    faults: 'immediate',
    preset: 'open',
    inheritedFrom: 'show',
    selfCheckinEnabled: true,
  }),
}));

vi.mock('@/hooks/mutations/useVisibilityMutations', () => ({
  useUpdateShowVisibility: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTrialVisibility: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateClassVisibility: () => ({ mutate: vi.fn(), isPending: false }),
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  showId: 'show-1',
  trials: [
    { id: 'trial-1', name: 'Trial 1' },
    { id: 'trial-2', name: 'Trial 2' },
  ],
  classes: [{ id: 'class-1', trialId: 'trial-1', name: 'Interior Novice A' }],
};

describe('ShowSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders panel title', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Show Settings')).toBeInTheDocument();
  });

  it('renders result visibility section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Result Visibility')).toBeInTheDocument();
  });

  it('renders three preset options', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('renders self check-in section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Self Check-in')).toBeInTheDocument();
  });

  it('renders trial overrides section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Trial Overrides')).toBeInTheDocument();
  });

  it('renders class overrides section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Class Overrides')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(<ShowSettingsPanel {...defaultProps} open={false} />);
    // SlideOverPanel returns null when closed (open=false and not animating)
    expect(screen.queryByText('Result Visibility')).not.toBeInTheDocument();
  });
});
