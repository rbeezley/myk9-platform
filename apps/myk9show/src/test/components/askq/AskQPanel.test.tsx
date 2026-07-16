import { fireEvent, screen, waitFor } from '@testing-library/react';
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

    const input = screen.getByPlaceholderText('Ask about using myK9Show...');
    fireEvent.change(input, { target: { value: 'Where is my armband?' } });
    expect(input).toHaveValue('Where is my armband?');

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

    expect(
      await screen.findByText("I couldn't find a reliable answer for that.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use the box below, then click Create ticket so we can follow up in the app.'
      )
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
    const input = screen.getByPlaceholderText('Ask about the selected rulebook...');
    fireEvent.change(input, { target: { value: 'Max time?' } });
    expect(input).toHaveValue('Max time?');
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

  it('shows an answer skeleton while waiting for the first AskQ response token', async () => {
    // Deferred: the test decides when the first response arrives, so the
    // skeleton assertion cannot race the stream under load. parseSSEStream is
    // module-mocked to a no-op, so deliver events through its mock directly.
    let releaseResponse!: (stream: ReadableStream<Uint8Array>) => void;
    vi.mocked(askqService.sendAskQQuery).mockReturnValue(
      new Promise<ReadableStream<Uint8Array>>(resolve => {
        releaseResponse = resolve;
      })
    );
    vi.mocked(askqService.parseSSEStream).mockImplementation(async (_stream, onEvent) => {
      onEvent('token', 'Max time is 3 minutes.');
      onEvent('done', {});
    });

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />);

    await user.click(screen.getByRole('button', { name: 'Rules' }));
    // Barrier: prove the mode selection committed before interacting further
    // (same stale-closure hazard as the 'This show' test below).
    await screen.findByRole('button', { name: 'Rules', pressed: true });
    const input = screen.getByPlaceholderText('Ask about the selected rulebook...');
    fireEvent.change(input, { target: { value: 'Max time?' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    // The deferred is still pending, so the skeleton must already be in the
    // DOM — synchronous assertion, no waitFor needed.
    expect(screen.getByRole('status', { name: 'AskQ is answering' })).toBeInTheDocument();

    await act(async () => {
      releaseResponse(createMockStream('Max time is 3 minutes.'));
    });

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'AskQ is answering' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Max time is 3 minutes.')).toBeInTheDocument();
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
    // Barrier: prove the mode selection has committed before sending. Send reads the
    // committed `mode` via a captured closure; without this the click can fire against a
    // stale render where mode is still null and `questionMode: 'show-data'` is dropped.
    await screen.findByRole('button', { name: 'This show', pressed: true });
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
