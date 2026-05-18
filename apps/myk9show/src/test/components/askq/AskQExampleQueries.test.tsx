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
    expect(
      screen.getByText('What should I do if one ring is running behind schedule?')
    ).toBeInTheDocument();
  });

  it('calls onSelectQuery when a chip is clicked', async () => {
    const onSelect = vi.fn();
    const { user } = render(<AskQExampleQueries onSelectQuery={onSelect} />);

    await user.click(screen.getByText('How did my dog do today?'));
    expect(onSelect).toHaveBeenCalledWith('How did my dog do today?');
  });

  it('renders App Help chips', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.queryByText('Coming soon...')).not.toBeInTheDocument();
    expect(
      screen.getByText('What should I check before submitting final results after the show?')
    ).toBeInTheDocument();
  });
});
