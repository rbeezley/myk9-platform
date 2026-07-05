// apps/myk9show/src/test/components/askq/AskQExampleQueries.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQExampleQueries } from '@/components/askq/AskQExampleQueries';

describe('AskQExampleQueries', () => {
  it('renders category headings', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Show Data')).toBeInTheDocument();
    expect(screen.getByText('App Help')).toBeInTheDocument();
  });

  it('renders example query chips', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.getByText('What are the time limits for Excellent?')).toBeInTheDocument();
    expect(screen.getByText('How did my dog do today?')).toBeInTheDocument();
    expect(screen.getByText('How do I enter a show?')).toBeInTheDocument();
  });

  it('calls onSelectQuery with the query category when a chip is clicked', async () => {
    const onSelect = vi.fn();
    const { user } = render(<AskQExampleQueries onSelectQuery={onSelect} />);

    await user.click(screen.getByText('How did my dog do today?'));
    expect(onSelect).toHaveBeenCalledWith('How did my dog do today?', 'show-data');
  });

  it('renders App Help as an active support category', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.queryByText('Coming soon...')).not.toBeInTheDocument();
    expect(screen.getByText('I need help with a payment or refund')).toBeInTheDocument();
  });
});
