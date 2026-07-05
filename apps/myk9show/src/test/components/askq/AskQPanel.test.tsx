import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { act } from '@testing-library/react';
import type { SupportHelpState } from '@/features/support/useSupportHelp';

vi.mock('@/services/askqService');

const authState = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  userWithRoles: { roles: ['exhibitor'], scopes: [], permissions: [] },
}));

const defaultSupportState = (): SupportHelpState => ({
  status: 'idle',
  question: '',
  answer: '',
  toolsUsed: [],
  sources: {},
  route: null,
  ticket: null,
  error: null,
});

const supportHelp = vi.hoisted(() => ({
  current: {
    state: {
      status: 'idle',
      question: '',
      answer: '',
      toolsUsed: [],
      sources: {},
      route: null,
      ticket: null,
      error: null,
    } as SupportHelpState,
    askForHelp: vi.fn(),
    startEscalation: vi.fn(),
    createTicket: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

vi.mock('@/features/support/useSupportHelp', () => ({
  useSupportHelp: () => supportHelp.current,
}));

describe('AskQPanel', () => {
  beforeEach(() => {
    authState.user = { id: 'user-1' };
    supportHelp.current = {
      state: defaultSupportState(),
      askForHelp: vi.fn(),
      startEscalation: vi.fn(),
      createTicket: vi.fn(),
      reset: vi.fn(),
    };
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
    supportHelp.current.state = {
      ...defaultSupportState(),
      status: 'escalating',
      question: 'I need help with a payment or refund',
      route: {
        kind: 'escalate',
        reason: 'payment_or_refund',
        message: 'Payment and refund questions need human review.',
        question: 'I need help with a payment or refund',
      },
    };

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/exhibitor/entries' });

    await user.click(screen.getByRole('button', { name: 'I need help with a payment or refund' }));

    expect(
      screen.getByText('Sign in to create a support ticket so we can reply in the app.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to create a ticket' })).toHaveAttribute(
      'href',
      '/sign-in?returnTo=%2Fexhibitor%2Fentries'
    );
    expect(screen.queryByLabelText('Support request')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create ticket/i })).not.toBeInTheDocument();
  });
});
