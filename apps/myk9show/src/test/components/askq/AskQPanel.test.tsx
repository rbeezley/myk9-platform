import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { act } from '@testing-library/react';
import * as askqService from '@/services/askqService';

vi.mock('@/services/askqService');

const authState = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  userWithRoles: { roles: ['exhibitor'], scopes: [], permissions: [] },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

describe('AskQPanel', () => {
  beforeEach(() => {
    authState.user = { id: 'user-1' };
    vi.clearAllMocks();
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

  it('asks guests to sign in before creating an App Help ticket', async () => {
    authState.user = null;

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/exhibitor/entries' });

    await user.click(screen.getByRole('button', { name: 'I need help with a payment or refund' }));

    await waitFor(() => {
      expect(
        screen.getByText('Sign in to create a support ticket so we can reply in the app.')
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Sign in to create a ticket' })).toHaveAttribute(
      'href',
      '/sign-in?returnTo=%2Fexhibitor%2Fentries'
    );
    expect(screen.queryByLabelText('Support request')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create ticket/i })).not.toBeInTheDocument();
    expect(askqService.sendAskQQuery).not.toHaveBeenCalled();
  });
});
