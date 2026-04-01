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
});
