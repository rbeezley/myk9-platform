import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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
    level: 'Novice',
    hides: '1',
    distractions: '0',
    time_limit_text: '2:00',
    time_type: 'fixed',
    area_count: 1,
    hides_known: true,
    has_blank: false,
    timer_mode: 'single',
    odors: ['Birch', 'Anise', 'Clove', 'Cypress'],
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
      requirements: makeRequirements({ area_count: 1, distractions: '0' }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    // Time Limit should be present
    expect(screen.getByText('Time Limit')).toBeInTheDocument();
    // Search Areas should NOT be present (area_count <= 1)
    expect(screen.queryByText('Search Areas')).not.toBeInTheDocument();
    // Distractions should NOT be present (value is "0")
    expect(screen.queryByText('Distractions')).not.toBeInTheDocument();
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

  it('shows Distractions card when distractions > 0', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({ distractions: '2' }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('Distractions')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows Search Areas card when area_count > 1', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({ area_count: 3 }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('Search Areas')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows Dual Timer card when timer_mode is dual', () => {
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({ timer_mode: 'dual' }),
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsPanel {...defaultProps} />);
    expect(screen.getByText('Timer Mode')).toBeInTheDocument();
    expect(screen.getByText('Dual Timer')).toBeInTheDocument();
  });

  it('shows empty state message when no requirements found (null)', () => {
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

  it('shows empty state message when requirements exist but all display fields are empty', () => {
    // A DB row exists but none of the conditional fields have displayable data —
    // this was the original bug: the panel rendered completely blank with no feedback.
    mockUseClassRequirements.mockReturnValue({
      requirements: makeRequirements({
        hides: '',
        time_limit_text: '',
        distractions: '0',
        area_count: 1,
        has_blank: false,
        timer_mode: 'single',
        odors: [],
      }),
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
