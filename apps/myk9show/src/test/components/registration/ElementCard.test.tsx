import { render, screen } from '@/test/utils/testUtils';
import { ElementCard } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';
import type { LevelInfo } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.types';

const baseLevels: LevelInfo[] = [
  {
    classId: 'c1',
    level: 'Novice',
    section: 'A',
    displayLabel: 'Novice A',
    isSelected: false,
    isAlreadyEntered: false,
  },
  {
    classId: 'c2',
    level: 'Novice',
    section: 'B',
    displayLabel: 'Novice B',
    isSelected: false,
    isAlreadyEntered: false,
  },
  {
    classId: 'c3',
    level: 'Advanced',
    section: undefined,
    displayLabel: 'Advanced',
    isSelected: false,
    isAlreadyEntered: false,
  },
  {
    classId: 'c4',
    level: 'Excellent',
    section: undefined,
    displayLabel: 'Excellent',
    isSelected: false,
    isAlreadyEntered: false,
  },
  {
    classId: 'c5',
    level: 'Masters',
    section: undefined,
    displayLabel: 'Masters',
    isSelected: false,
    isAlreadyEntered: false,
  },
];

describe('ElementCard', () => {
  const defaultProps = {
    element: 'Handler Discrimination',
    levels: baseLevels,
    fee: 10,
    isSingleClass: false,
    onToggle: vi.fn(),
  };

  it('renders element name and fee', () => {
    render(<ElementCard {...defaultProps} />);
    expect(screen.getByText('Handler Discrimination')).toBeInTheDocument();
    expect(screen.getByText('$10/class')).toBeInTheDocument();
  });

  it('renders all level chips', () => {
    render(<ElementCard {...defaultProps} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('Novice B')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('Masters')).toBeInTheDocument();
  });

  it('calls onToggle with classId when chip is clicked', async () => {
    const onToggle = vi.fn();
    const { user } = render(<ElementCard {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByText('Advanced'));
    expect(onToggle).toHaveBeenCalledWith('c3');
  });

  it('gives each class checkbox an explicit accessible name', () => {
    render(<ElementCard {...defaultProps} />);
    expect(screen.getByRole('checkbox', { name: 'Select Advanced' })).toBeInTheDocument();
  });

  it('shows selected chip with accent styling', () => {
    const levels = baseLevels.map(l => (l.classId === 'c3' ? { ...l, isSelected: true } : l));
    render(<ElementCard {...defaultProps} levels={levels} />);
    const chip = screen.getByText('Advanced').closest('label');
    expect(chip?.className).toContain('selected');
  });

  it('shows already-entered chip with teal styling and disabled checkbox', () => {
    const levels = baseLevels.map(l => (l.classId === 'c1' ? { ...l, isAlreadyEntered: true } : l));
    render(<ElementCard {...defaultProps} levels={levels} />);
    const chip = screen.getByText('Novice A').closest('label');
    expect(chip?.className).toContain('entered');
    const checkbox = chip?.querySelector('input[type="checkbox"], button[role="checkbox"]');
    expect(checkbox).toHaveAttribute('disabled');
  });

  it('renders single-class element with inline checkbox in header', () => {
    const singleLevel: LevelInfo[] = [
      {
        classId: 'det1',
        level: '',
        section: undefined,
        displayLabel: '',
        isSelected: false,
        isAlreadyEntered: false,
      },
    ];
    render(
      <ElementCard
        element="Detective"
        levels={singleLevel}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Detective')).toBeInTheDocument();
    expect(screen.queryByText('Novice')).not.toBeInTheDocument();
  });

  it('gives the single-class checkbox an explicit accessible name', () => {
    const singleLevel: LevelInfo[] = [
      {
        classId: 'det1',
        level: '',
        section: undefined,
        displayLabel: '',
        isSelected: false,
        isAlreadyEntered: false,
      },
    ];
    render(
      <ElementCard
        element="Detective"
        levels={singleLevel}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Select Detective' })).toBeInTheDocument();
  });

  it('renders fee as "$10" (not "$10/class") for single-class elements', () => {
    const singleLevel: LevelInfo[] = [
      {
        classId: 'det1',
        level: '',
        section: undefined,
        displayLabel: '',
        isSelected: false,
        isAlreadyEntered: false,
      },
    ];
    render(
      <ElementCard
        element="Detective"
        levels={singleLevel}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.queryByText('$10/class')).not.toBeInTheDocument();
  });

  it('renders element with one level as chips when level exists', () => {
    const singleLevelWithLevel: LevelInfo[] = [
      {
        classId: 'b1',
        level: 'Advanced',
        section: undefined,
        displayLabel: 'Advanced',
        isSelected: false,
        isAlreadyEntered: false,
      },
    ];
    render(
      <ElementCard
        element="Buried"
        levels={singleLevelWithLevel}
        fee={10}
        isSingleClass={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Buried')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('$10/class')).toBeInTheDocument();
  });
});
