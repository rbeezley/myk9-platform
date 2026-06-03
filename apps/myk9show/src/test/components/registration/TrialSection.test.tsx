import { render, screen } from '@/test/utils/testUtils';
import { TrialSection } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';

describe('TrialSection', () => {
  const defaultProps = {
    trialName: 'Saturday Trial 1',
    trialType: 'Scent Work' as string | undefined,
    selectedCount: 3,
    isExpanded: true,
    onToggle: vi.fn(),
  };

  it('renders trial name and type badge', () => {
    render(
      <TrialSection {...defaultProps}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
  });

  it('humanizes stored trial type enum values', () => {
    render(
      <TrialSection {...defaultProps} trialType="scent_work">
        <div />
      </TrialSection>
    );
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
    expect(screen.queryByText('scent_work')).not.toBeInTheDocument();
  });

  it('shows selected count when > 0', () => {
    render(
      <TrialSection {...defaultProps}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('shows "0 selected" in muted style when count is 0', () => {
    render(
      <TrialSection {...defaultProps} selectedCount={0}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('renders children when expanded', () => {
    render(
      <TrialSection {...defaultProps} isExpanded={true}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('hides children when collapsed', () => {
    render(
      <TrialSection {...defaultProps} isExpanded={false}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('calls onToggle when header is clicked', async () => {
    const onToggle = vi.fn();
    const { user } = render(
      <TrialSection {...defaultProps} onToggle={onToggle}>
        <div />
      </TrialSection>
    );
    await user.click(screen.getByText('Saturday Trial 1'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('omits type badge when trialType is undefined', () => {
    render(
      <TrialSection {...defaultProps} trialType={undefined}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.queryByText('Scent Work')).not.toBeInTheDocument();
  });
});
