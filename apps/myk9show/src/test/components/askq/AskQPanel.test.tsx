import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { act } from '@testing-library/react';

vi.mock('@/services/askqService');

describe('AskQPanel', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('does not render when panel is closed', () => {
    render(<AskQPanel />);
    expect(screen.queryByText('AskQ Assistant')).not.toBeInTheDocument();
  });

  it('renders when panel is open', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(screen.getByText('AskQ Assistant')).toBeInTheDocument();
  });

  it('shows example queries in empty state', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Show Data')).toBeInTheDocument();
  });

  it('shows the input bar', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...')
    ).toBeInTheDocument();
  });

  it('prefills the input from a workbench prompt', () => {
    act(() =>
      useAskQPanelStore
        .getState()
        .openWithPrompt('What should I do if one ring is running behind schedule?')
    );
    render(<AskQPanel />);

    expect(screen.getByPlaceholderText('Ask about rules, your results, or the app...')).toHaveValue(
      'What should I do if one ring is running behind schedule?'
    );
  });

  it('clears the suggested prompt after submit', async () => {
    act(() =>
      useAskQPanelStore
        .getState()
        .openWithPrompt('What should I do if one ring is running behind schedule?')
    );
    const { user } = render(<AskQPanel />);

    await user.click(screen.getByRole('button', { name: 'Send query' }));

    expect(useAskQPanelStore.getState().suggestedPrompt).toBeNull();
  });
});
