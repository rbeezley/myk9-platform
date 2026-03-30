import { render, screen } from '@/test/utils/testUtils';

import { FilterBreadcrumb } from '@/components/entries/management/FilterBreadcrumb';

describe('FilterBreadcrumb', () => {
  const defaultProps = {
    trialName: null,
    className: null,
    onClearTrial: vi.fn(),
    onClearClass: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no filters are active', () => {
    const { container } = render(<FilterBreadcrumb {...defaultProps} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "All Entries" and trial name when trial filter is active', () => {
    render(
      <FilterBreadcrumb
        {...defaultProps}
        trialName="Saturday Trial"
      />
    );

    expect(screen.getByText('All Entries')).toBeInTheDocument();
    expect(screen.getByText('Saturday Trial')).toBeInTheDocument();
  });

  it('shows all three segments when both trial and class are active', () => {
    render(
      <FilterBreadcrumb
        {...defaultProps}
        trialName="Saturday Trial"
        className="Open Standard"
      />
    );

    expect(screen.getByText('All Entries')).toBeInTheDocument();
    expect(screen.getByText('Saturday Trial')).toBeInTheDocument();
    expect(screen.getByText('Open Standard')).toBeInTheDocument();
  });

  it('calls onClearTrial when "All Entries" is clicked', async () => {
    const onClearTrial = vi.fn();
    const { user } = render(
      <FilterBreadcrumb
        {...defaultProps}
        trialName="Saturday Trial"
        onClearTrial={onClearTrial}
      />
    );

    await user.click(screen.getByText('All Entries'));
    expect(onClearTrial).toHaveBeenCalledOnce();
  });

  it('calls onClearClass when trial name is clicked with class active', async () => {
    const onClearClass = vi.fn();
    const { user } = render(
      <FilterBreadcrumb
        {...defaultProps}
        trialName="Saturday Trial"
        className="Open Standard"
        onClearClass={onClearClass}
      />
    );

    await user.click(screen.getByText('Saturday Trial'));
    expect(onClearClass).toHaveBeenCalledOnce();
  });
});
