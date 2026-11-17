// apps/myk9show/src/test/components/askq/AskQExampleQueries.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQExampleQueries } from '@/components/askq/AskQExampleQueries';

describe('AskQExampleQueries', () => {
  it('renders one flat set of chips with no category headings', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.getByText('How did my dog do today?')).toBeInTheDocument();
    expect(screen.getByText('Where do I find my armband number?')).toBeInTheDocument();
    expect(screen.getByText('I need help with a payment or refund')).toBeInTheDocument();
    expect(screen.queryByText('Rules')).not.toBeInTheDocument();
    expect(screen.queryByText('Show Data')).not.toBeInTheDocument();
    expect(screen.queryByText('App Help')).not.toBeInTheDocument();
  });

  it('calls onSelectQuery with the query text when a chip is clicked', async () => {
    const onSelect = vi.fn();
    const { user } = render(<AskQExampleQueries onSelectQuery={onSelect} />);

    await user.click(screen.getByText('How did my dog do today?'));
    expect(onSelect).toHaveBeenCalledWith('How did my dog do today?');
  });

  it('shows staff how-to suggestions instead for staff', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} isStaff />);
    expect(screen.getByText('How do I add a late entry?')).toBeInTheDocument();
    expect(screen.queryByText('How did my dog do today?')).not.toBeInTheDocument();
  });
});
