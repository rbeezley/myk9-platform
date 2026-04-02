// apps/myk9show/src/test/components/askq/AskQSources.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQSources } from '@/components/askq/AskQSources';

describe('AskQSources', () => {
  const mockSources = {
    rules: [{ id: '1', title: 'Time Limits', section: '3.1', content: 'Novice: 3 minutes' }],
    entries: [
      {
        armband: '101',
        dog_name: 'Buddy',
        handler_name: 'John',
        placement: 1,
        qualification_status: 'Q',
      },
    ],
  };

  it('renders nothing when sources are empty', () => {
    const { container } = render(<AskQSources sources={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a collapsible card with source count', () => {
    render(<AskQSources sources={mockSources} />);
    expect(screen.getByText(/Sources \(2\)/)).toBeInTheDocument();
  });

  it('expands to show source details on click', async () => {
    const { user } = render(<AskQSources sources={mockSources} />);

    await user.click(screen.getByText(/Sources \(2\)/));

    expect(screen.getByText('Time Limits')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('collapses on second click', async () => {
    const { user } = render(<AskQSources sources={mockSources} />);

    await user.click(screen.getByText(/Sources \(2\)/));
    expect(screen.getByText('Time Limits')).toBeInTheDocument();

    await user.click(screen.getByText(/Sources \(2\)/));
    expect(screen.queryByText('Time Limits')).not.toBeInTheDocument();
  });
});
