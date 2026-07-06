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
    expect(screen.getByText('This show')).toBeInTheDocument();
  });

  it('shows the input bar', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(screen.getByPlaceholderText('Ask about using myK9Show...')).toBeInTheDocument();
  });

  it('prefills the input from a workbench prompt', () => {
    act(() =>
      useAskQPanelStore
        .getState()
        .openWithPrompt('What should I do if one ring is running behind schedule?')
    );
    render(<AskQPanel />);

    expect(screen.getByPlaceholderText('Ask about using myK9Show...')).toBeInTheDocument();
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

  it('routes typed default App Help questions through support mode', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/exhibitor/entries' });

    await user.type(
      screen.getByPlaceholderText('Ask about using myK9Show...'),
      'Where is my armband?'
    );
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    await waitFor(() => {
      expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
        {
          message: 'Where is my armband?',
          supportMode: true,
        },
        expect.any(AbortSignal)
      );
    });
  });

  it('gives a clear next step when App Help escalates to ticket creation', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/exhibitor/entries' });

    await user.type(
      screen.getByPlaceholderText('Ask about using myK9Show...'),
      'Where are my entries?'
    );
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    expect(await screen.findByText("I couldn't find a reliable answer for that.")).toBeInTheDocument();
    expect(
      screen.getByText('Use the box below, then click Create ticket so we can follow up in the app.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create ticket/i })).toBeInTheDocument();
  });

  it('sends rules mode with the selected rulebook scope', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />);

    await user.click(screen.getByRole('button', { name: 'Rules' }));
    await user.selectOptions(screen.getByLabelText('Organization'), 'AKC');
    await user.selectOptions(screen.getByLabelText('Sport'), 'akc-scent-work');
    await user.type(screen.getByPlaceholderText('Ask about the selected rulebook...'), 'Max time?');
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    await waitFor(() => {
      expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
        {
          message: 'Max time?',
          questionMode: 'rules',
          rulebookScope: { organizationCode: 'AKC', sportCode: 'akc-scent-work' },
        },
        expect.any(AbortSignal)
      );
    });
  });

  it('keeps route-default mode out of the payload until the user chooses it', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/at-show/show-1' });

    await user.type(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...'),
      'Schedule?'
    );
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    await waitFor(() => {
      expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
        {
          message: 'Schedule?',
          showId: 'show-1',
        },
        expect.any(AbortSignal)
      );
    });
  });

  it('sends This show mode after the user explicitly chooses it', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/at-show/show-1' });

    await user.click(screen.getByRole('button', { name: 'This show' }));
    await user.type(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...'),
      'Schedule?'
    );
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    await waitFor(() => {
      expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
        {
          message: 'Schedule?',
          showId: 'show-1',
          questionMode: 'show-data',
        },
        expect.any(AbortSignal)
      );
    });
  });
});

function createMockStream(answer?: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      if (answer) {
        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(answer)}\n\n`));
      }
      controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
      controller.close();
    },
  });
}
