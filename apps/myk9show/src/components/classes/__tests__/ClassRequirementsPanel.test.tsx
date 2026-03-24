import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassRequirementsPanel } from '../ClassRequirementsPanel';
import type { ClassRequirements } from '@/hooks/queries/useClassRequirements';

// Mock the useClassRequirements hook
const mockUseClassRequirements = vi.fn<
  [],
  { requirements: ClassRequirements | null; isLoading: boolean; error: Error | null }
>();

vi.mock('@/hooks/queries/useClassRequirements', () => ({
  useClassRequirements: (...args: unknown[]) => mockUseClassRequirements(...(args as [])),
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  organization: 'AKC',
  element: 'Container',
  level: 'Novice A',
};

function makeRequirements(overrides: Partial<ClassRequirements> = {}): ClassRequirements {
  return {
    organization: 'AKC',
    element: 'Container',
    level: 'Novice A',
    hides: '1',
    distractions: '0',
    height: '',
    area_count: 1,
    area_size: '200-400 sq ft',
    time_limit_text: '2:30',
    time_limit_seconds: 150,
    has_30_second_warning: true,
    time_type: 'fixed',
    warning_notes: null,
    required_calls: 'Alert',
    final_response: null,
    containers_items: '6-10',
    area_count_min: null,
    area_count_max: null,
    ...overrides,
  };
}

describe('ClassRequirementsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClassRequirements.mockReturnValue({
      requirements: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders nothing when open is false', () => {
    const { container } = render(<ClassRequirementsPanel {...defaultProps} open={false} />);
    // SlideOverPanel returns null when not open and not animating
    expect(container.innerHTML).toBe('');
  });

  it('shows loading state while requirements fetch', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: null,
      isLoading: true,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('Loading requirements...')).toBeInTheDocument();
  });

  it('renders organization, element, and level badges in the header', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements(),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('AKC')).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Novice A')).toBeInTheDocument();
  });

  it('renders requirement cards conditionally (only when field has data)', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({ height: '', area_count: 1 }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    // Time Limit should be present
    expect(screen.getByText('Time Limit')).toBeInTheDocument();
    // Max Height should NOT be present (empty string)
    expect(screen.queryByText('Max Height')).not.toBeInTheDocument();
    // Search Areas should NOT be present (area_count <= 1)
    expect(screen.queryByText('Search Areas')).not.toBeInTheDocument();
  });

  it('shows Time Limit card with time_limit_text', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({ time_limit_text: '3:00' }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('Time Limit')).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
  });

  it('shows Hides card when hides field exists', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({ hides: '2' }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('Hides')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows Required Calls for AKC, Final Response for UKC', () => {
    // AKC case
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({
        organization: 'AKC',
        required_calls: 'Alert',
        final_response: null,
      }),
      isLoading: false,
      error: null,
    });
    const { unmount } = render(<ClassRequirementsPanel {...defaultProps} organization="AKC" />);
    expect(screen.getByText('Required Calls')).toBeInTheDocument();
    expect(screen.getByText('Alert')).toBeInTheDocument();
    unmount();

    // UKC case
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({
        organization: 'UKC',
        required_calls: null,
        final_response: 'Final Response Signal',
      }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} organization="UKC" />);
    expect(screen.getByText('Final Response')).toBeInTheDocument();
    expect(screen.getByText('Final Response Signal')).toBeInTheDocument();
  });

  it('shows empty state message when no requirements found', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: null,
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(
      screen.getByText('No requirements found for this class configuration')
    ).toBeInTheDocument();
  });

  it('shows source attribution footer', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements(),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} organization="AKC" />);
    expect(screen.getByText('Source: AKC Scent Work Regulations')).toBeInTheDocument();
  });
});
