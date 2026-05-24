import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { SetupAdaptiveHeader } from '../SetupAdaptiveHeader';

describe('SetupAdaptiveHeader', () => {
  it('renders the ready state when signals is empty', () => {
    render(<SetupAdaptiveHeader signals={[]} />);
    expect(screen.getByRole('heading', { name: 'Setup ready' })).toBeInTheDocument();
    expect(screen.queryByTestId('setup-signals')).not.toBeInTheDocument();
  });

  it('renders the pending state with a chip per signal', () => {
    render(
      <SetupAdaptiveHeader
        signals={[
          { id: 'no-trials', label: 'No trials yet' },
          { id: 'judges-missing', label: 'Judges not assigned' },
        ]}
      />
    );
    expect(screen.getByRole('heading', { name: 'Finish setup' })).toBeInTheDocument();
    const chips = screen.getByTestId('setup-signals');
    expect(chips).toHaveTextContent('No trials yet');
    expect(chips).toHaveTextContent('Judges not assigned');
  });

  it('uses singular vs plural copy correctly', () => {
    const { rerender } = render(
      <SetupAdaptiveHeader
        signals={[{ id: 'no-trials', label: 'No trials yet' }]}
      />
    );
    expect(screen.getByText(/1 item left/i)).toBeInTheDocument();

    rerender(
      <SetupAdaptiveHeader
        signals={[
          { id: 'no-trials', label: 'No trials yet' },
          { id: 'no-classes', label: 'No classes built' },
        ]}
      />
    );
    expect(screen.getByText(/2 items left/i)).toBeInTheDocument();
  });
});
