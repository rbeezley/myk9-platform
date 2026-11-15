import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { TERA_WORKING_COPY } from '@/components/askq/askq-config';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { act } from '@testing-library/react';
import * as askqService from '@/services/askqService';
import { createSupportTicket } from '@/features/support/supportTickets';
import { ASKQ_HISTORY_MAX_ENTRIES, saveAskQHistory } from '@/hooks/askqHistory';

vi.mock('@/services/askqService');
vi.mock('@/features/support/supportTickets', () => ({
  createSupportTicket: vi.fn(),
}));

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
    authState.userWithRoles.roles = ['exhibitor'];
    // `parseSSEStream` is overridden by the deferred skeleton test. Clear-only
    // resets let that implementation leak when Vitest shuffles test order.
    vi.clearAllMocks();
    vi.mocked(askqService.sendAskQQuery).mockReset();
    vi.mocked(askqService.parseSSEStream).mockReset();
    useAskQPanelStore.getState().close();
  });

  it('does not render when panel is closed', () => {
    render(<AskQPanel />);
    expect(screen.queryByText('Ask for help')).not.toBeInTheDocument();
  });

  it('renders when panel is open', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(screen.getByText('Ask for help')).toBeInTheDocument();
    expect(screen.getByText('AskQ')).toBeInTheDocument();
  });

  describe('reaching a person when AskQ cannot answer', () => {
    async function askOnShowPage(text: string) {
      act(() => useAskQPanelStore.getState().open());
      const view = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
      await view.user.click(screen.getByRole('button', { name: 'Send query' }));
      return view;
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('offers Send this to a person after an AskQ error and carries the question into the note', async () => {
      vi.mocked(askqService.sendAskQQuery).mockRejectedValue(new Error('down'));
      vi.mocked(createSupportTicket).mockResolvedValue({ id: 'ticket-1' });
      const { user } = await askOnShowPage('Why is my scoresheet blank?');

      await user.click(await screen.findByRole('button', { name: 'Send this to a person' }));

      expect(screen.getByRole('textbox', { name: 'Support request' })).toHaveValue(
        'Why is my scoresheet blank?'
      );
      expect(askqService.sendAskQQuery).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /Create ticket/i }));
      await waitFor(() =>
        expect(createSupportTicket).toHaveBeenCalledWith(
          expect.objectContaining({ ownerId: 'user-1', body: 'Why is my scoresheet blank?' })
        )
      );
    });

    it('still offers Send this to a person when the daily limit is reached, without asking AskQ', async () => {
      vi.mocked(askqService.sendAskQQuery).mockRejectedValue(
        new askqService.RateLimitError(0, 10, '2026-11-15T00:00:00.000Z')
      );
      const { user } = await askOnShowPage('Need a human');

      await user.click(await screen.findByRole('button', { name: 'Send this to a person' }));

      expect(screen.getByRole('textbox', { name: 'Support request' })).toHaveValue('Need a human');
      expect(askqService.sendAskQQuery).toHaveBeenCalledTimes(1);
    });

    it('hides Send this to a person once the ticket step is open, so a second click cannot file a duplicate', async () => {
      vi.mocked(askqService.sendAskQQuery).mockRejectedValue(
        new askqService.RateLimitError(0, 10, '2026-11-15T00:00:00.000Z')
      );
      const { user } = await askOnShowPage('Need a human');
      await user.click(await screen.findByRole('button', { name: 'Send this to a person' }));

      expect(screen.getByRole('textbox', { name: 'Support request' })).toBeInTheDocument();
      expect(screen.getByText(/Daily limit reached/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send this to a person' })).toBeNull();
    });

    it('treats a finished turn with no text and no escalation as a handoff, with no feedback', async () => {
      vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
      vi.mocked(askqService.parseSSEStream).mockImplementation(async (_stream, onEvent) => {
        onEvent('meta', { remaining: 9, limit: 10, responseTimeMs: 1, queryLogId: 'log-1' });
        onEvent('done', {});
      });
      const { user } = await askOnShowPage('Anything?');

      expect(
        await screen.findByText("I couldn't find a reliable answer for that.")
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /helpful/i })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Send this to a person' }));
      expect(screen.getByRole('textbox', { name: 'Support request' })).toHaveValue('Anything?');
    });

    it('says plainly it could not be sent offline, keeps the note and sends nothing', async () => {
      vi.mocked(askqService.sendAskQQuery).mockRejectedValue(new Error('down'));
      const { user } = await askOnShowPage('Judge is missing');
      await user.click(await screen.findByRole('button', { name: 'Send this to a person' }));

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      await user.click(screen.getByRole('button', { name: /Create ticket/i }));

      expect(await screen.findByText(/You're offline, so this could not be sent/)).toBeVisible();
      expect(screen.getByRole('textbox', { name: 'Support request' })).toHaveValue(
        'Judge is missing'
      );
      expect(createSupportTicket).not.toHaveBeenCalled();
    });
  });

  describe('suggestions by role', () => {
    it('shows a secretary how-to suggestions and no exhibitor questions', () => {
      authState.userWithRoles.roles = ['secretary'];
      act(() => useAskQPanelStore.getState().open());
      render(<AskQPanel />, { initialRoute: '/shows/show-1' });

      expect(screen.getByText('How do I add a late entry?')).toBeInTheDocument();
      expect(screen.queryByText('How did my dog do today?')).not.toBeInTheDocument();
      expect(screen.queryByText('Show me the trial schedule')).not.toBeInTheDocument();
    });

    it('keeps the exhibitor suggestions for an exhibitor', () => {
      act(() => useAskQPanelStore.getState().open());
      render(<AskQPanel />, { initialRoute: '/shows/show-1' });

      expect(screen.getByText('How did my dog do today?')).toBeInTheDocument();
      expect(screen.queryByText('How do I add a late entry?')).not.toBeInTheDocument();
    });
  });

  it('has no mode tabs on a show page, an app page or for a site admin', () => {
    const pages = ['/shows/show-1', '/exhibitor/entries', '/at-show/show-1'];
    for (const role of ['exhibitor', 'secretary', 'site_admin']) {
      authState.userWithRoles.roles = [role];
      for (const initialRoute of pages) {
        act(() => useAskQPanelStore.getState().open());
        const { unmount } = render(<AskQPanel />, { initialRoute });
        for (const name of ['App help', 'Rules', 'This show', 'Operator Support']) {
          expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        }
        unmount();
      }
    }
  });

  it('sends a question from a page with no show without a question mode', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/exhibitor/entries' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Where is my armband?' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    await waitFor(() => {
      expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
        { message: 'Where is my armband?', supportMode: true },
        expect.any(AbortSignal)
      );
    });
  });

  describe.each([
    ['a show page', '/shows/show-1'],
    ['an app page', '/exhibitor/entries'],
  ])('when the server cannot verify a guide answer on %s', (_label, initialRoute) => {
    it('offers the human handoff and carries the question into the ticket note', async () => {
      vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
      vi.mocked(askqService.parseSSEStream).mockImplementation(async (_stream, onEvent) => {
        onEvent('support_escalation', {
          escalate: true,
          reason: 'low_confidence',
          message: "I couldn't verify that answer.",
        });
        onEvent('done', {});
      });

      act(() => useAskQPanelStore.getState().open());
      const { user } = render(<AskQPanel />, { initialRoute });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Where is my armband?' } });
      await user.click(screen.getByRole('button', { name: 'Send query' }));

      expect(await screen.findByText("I couldn't verify that answer.")).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Send this to a person' }));
      expect(screen.getByRole('textbox', { name: 'Support request' })).toHaveValue(
        'Where is my armband?'
      );
    });
  });

  it('prefills the input from a workbench prompt', () => {
    act(() =>
      useAskQPanelStore
        .getState()
        .openWithPrompt('What should I do if one ring is running behind schedule?')
    );
    render(<AskQPanel />);

    expect(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...')
    ).toBeInTheDocument();
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

  it('shows Tera working while waiting for the first AskQ response token, then idle', async () => {
    // Deferred: the test decides when the first response arrives, so the
    // working-dock assertion cannot race the stream under load. parseSSEStream
    // is module-mocked to a no-op, so deliver events through its mock directly.
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

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    fireEvent.change(input, { target: { value: 'Max time?' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    // The deferred is still pending, so Tera's working dock must already be
    // in the DOM — synchronous assertion, no waitFor needed.
    expect(screen.getByRole('status', { name: TERA_WORKING_COPY })).toBeInTheDocument();

    await act(async () => {
      releaseResponse(createMockStream('Max time is 3 minutes.'));
    });

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: TERA_WORKING_COPY })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Max time is 3 minutes.')).toBeInTheDocument();
    // MYK9-851: the token and `done` land together here, through the real
    // useAskQ hook, and Found it still plays once before Tera settles.
    expect(screen.getByTestId('tera-found-it')).toBeInTheDocument();
    fireEvent.ended(screen.getByTestId('tera-found-it').querySelector('video') as HTMLVideoElement);
    expect(screen.getByTestId('tera-face')).toBeInTheDocument();
  });

  it('sends one unrouted question with the show context and no question mode', async () => {
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());

    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/at-show/show-1' });

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    fireEvent.change(input, { target: { value: 'Schedule?' } });
    expect(input).toHaveValue('Schedule?');
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    await waitFor(() => {
      expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
        {
          message: 'Schedule?',
          showId: 'show-1',
          supportMode: true,
        },
        expect.any(AbortSignal)
      );
    });
  });

  it('keeps the thread after close and reopen, and Clear history empties it', async () => {
    window.localStorage.clear();
    authState.userWithRoles.roles = ['exhibitor'];
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
    vi.mocked(askqService.parseSSEStream).mockImplementation(async (_stream, onEvent) => {
      onEvent('token', 'Saved answer');
      onEvent('done', {});
    });
    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my question' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));
    expect(await screen.findByText('Saved answer')).toBeInTheDocument();

    act(() => useAskQPanelStore.getState().close());
    act(() => useAskQPanelStore.getState().open());
    expect(await screen.findByText('Saved answer')).toBeInTheDocument();
    expect(screen.getByText('my question')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(screen.queryByText('Saved answer')).not.toBeInTheDocument());
  });

  it('scrolls the newest question and answer into view', async () => {
    window.localStorage.clear();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
    vi.mocked(askqService.parseSSEStream).mockImplementation(async (_stream, onEvent) => {
      onEvent('token', 'Bottom answer');
      onEvent('done', {});
    });
    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'q' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));
    await screen.findByText('Bottom answer');
    // The stream's events land outside act(), so the follow effect can flush after the text commits.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it('keeps scrolling as streamed tokens grow the answer', async () => {
    window.localStorage.clear();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    let emit!: (event: string, data: unknown) => void;
    let finish!: () => void;
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
    vi.mocked(askqService.parseSSEStream).mockImplementation(
      (_stream, onEvent) =>
        new Promise<void>(resolve => {
          emit = onEvent;
          finish = resolve;
        })
    );
    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'q' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));
    await waitFor(() => expect(emit).toBeDefined());

    act(() => emit('token', 'First part. '));
    await screen.findByText(/First part\./);
    // Each token reaches state on a requestAnimationFrame, outside act(): wait for its
    // follow effect, so the baseline below counts the first token's scroll.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const afterFirst = scrollIntoView.mock.calls.length;

    act(() => emit('token', 'Second part.'));
    await screen.findByText(/Second part\./);
    await waitFor(() => expect(scrollIntoView.mock.calls.length).toBeGreaterThan(afterFirst));

    await act(async () => {
      emit('done', {});
      finish();
    });
  });

  it('scrolls when an answer completes on a thread already at the 20-entry cap', async () => {
    window.localStorage.clear();
    const now = Date.now();
    saveAskQHistory(
      'user-1',
      'show-1',
      Array.from({ length: ASKQ_HISTORY_MAX_ENTRIES }, (_, i) => ({
        id: `seed-${i}`,
        question: `seed question ${i}`,
        answer: `seed answer ${i}`,
        toolsUsed: [],
        sources: {},
        queryLogId: null,
        askedAt: now - (ASKQ_HISTORY_MAX_ENTRIES - i) * 1000,
      }))
    );
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    let emit!: (event: string, data: unknown) => void;
    let finish!: () => void;
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
    vi.mocked(askqService.parseSSEStream).mockImplementation(
      (_stream, onEvent) =>
        new Promise<void>(resolve => {
          emit = onEvent;
          finish = resolve;
        })
    );
    act(() => useAskQPanelStore.getState().open());
    const { user } = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
    await screen.findByText('seed question 19');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'newest' } });
    await user.click(screen.getByRole('button', { name: 'Send query' }));
    await waitFor(() => expect(emit).toBeDefined());
    await screen.findByText('newest');
    scrollIntoView.mockClear();

    await act(async () => {
      emit('token', 'Capped answer');
      emit('done', {});
      finish();
    });
    await screen.findByText('Capped answer');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  describe('scroll pinning with a saved thread', () => {
    function seed(showId: string) {
      saveAskQHistory(
        'user-1',
        showId,
        [0, 1].map(i => ({
          id: `${showId}-${i}`,
          question: `${showId} question ${i}`,
          answer: `${showId} answer ${i}`,
          toolsUsed: [],
          sources: {},
          queryLogId: null,
          askedAt: Date.now() - (2 - i) * 1000,
        }))
      );
    }

    function GoToShow2() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/shows/show-2')}>
          go show 2
        </button>
      );
    }

    // Marker `below` px under the scroller's visible bottom edge; the scroller's own
    // scrollHeight leaves 64px of controls under the marker, as the real layout does.
    function scrollTo(below: number) {
      const marker = screen.getByTestId('thread-end');
      const scroller = marker.closest('.overflow-auto') as HTMLElement;
      Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
      Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
      scroller.scrollTop = 1500 - 64 + below;
      scroller.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
      marker.getBoundingClientRect = () => ({ bottom: 500 + below }) as DOMRect;
      fireEvent.scroll(scroller);
    }

    function stubStream() {
      let emit!: (event: string, data: unknown) => void;
      vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
      vi.mocked(askqService.parseSSEStream).mockImplementation(
        (_stream, onEvent) =>
          new Promise<void>(() => {
            emit = onEvent;
          })
      );
      return () => emit;
    }

    async function startStreaming(
      user: ReturnType<typeof render>['user'],
      emit: () => (event: string, data: unknown) => void
    ) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'newest' } });
      await user.click(screen.getByRole('button', { name: 'Send query' }));
      await waitFor(() => expect(emit()).toBeDefined());
    }

    beforeEach(() => {
      window.localStorage.clear();
      seed('show-1');
      seed('show-2');
    });

    it('stays pinned when only the controls below the scroll target are out of view', async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const emit = stubStream();
      act(() => useAskQPanelStore.getState().open());
      const { user } = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
      await screen.findByText('show-1 question 1');
      await startStreaming(user, emit);
      await screen.findByText('newest');

      scrollTo(0);
      scrollIntoView.mockClear();
      act(() => emit()('token', 'Streaming along'));
      await screen.findByText(/Streaming along/);
      // The token reaches state on a requestAnimationFrame, outside act(), so React may
      // commit the text before it flushes the passive effect that follows the thread.
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    });

    it('scrolls to the newest answer after scroll up, close and reopen', async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      act(() => useAskQPanelStore.getState().open());
      render(<AskQPanel />, { initialRoute: '/shows/show-1' });
      await screen.findByText('show-1 question 1');
      scrollTo(1300);

      act(() => useAskQPanelStore.getState().close());
      await waitFor(() => expect(screen.queryByText('show-1 question 1')).not.toBeInTheDocument());
      scrollIntoView.mockClear();
      act(() => useAskQPanelStore.getState().open());
      await screen.findByText('show-1 question 1');
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it('re-pins when switching to a different show', async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      act(() => useAskQPanelStore.getState().open());
      const { user } = render(
        <>
          <AskQPanel />
          <GoToShow2 />
        </>,
        { initialRoute: '/shows/show-1' }
      );
      await screen.findByText('show-1 question 1');
      scrollTo(1300);

      scrollIntoView.mockClear();
      await user.click(screen.getByRole('button', { name: 'go show 2' }));
      await screen.findByText('show-2 question 1');
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('scroll following', () => {
    async function setup() {
      window.localStorage.clear();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      let emit!: (event: string, data: unknown) => void;
      let finish!: () => void;
      vi.mocked(askqService.sendAskQQuery).mockResolvedValue(createMockStream());
      vi.mocked(askqService.parseSSEStream).mockImplementation(
        (_stream, onEvent) =>
          new Promise<void>(resolve => {
            emit = onEvent;
            finish = resolve;
          })
      );
      act(() => useAskQPanelStore.getState().open());
      const { user } = render(<AskQPanel />, { initialRoute: '/shows/show-1' });
      const ask = async (text: string) => {
        fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
        await user.click(screen.getByRole('button', { name: 'Send query' }));
        await waitFor(() => expect(emit).toBeDefined());
      };
      await ask('first');
      await screen.findByText('first');
      const scroller = screen.getByText('first').closest('.overflow-auto') as HTMLElement;
      return { scrollIntoView, scroller, ask, user, emit: () => emit, finish: () => finish };
    }

    // Reports the scroll target as `below` px under the scroller's visible bottom edge.
    function scrollTo(scroller: HTMLElement, below: number) {
      const marker = scroller.querySelector('[data-testid="thread-end"]') as HTMLElement;
      scroller.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
      marker.getBoundingClientRect = () => ({ bottom: 500 + below }) as DOMRect;
      fireEvent.scroll(scroller);
    }

    it('follows streamed text while the reader is near the bottom', async () => {
      const { scrollIntoView, scroller, emit } = await setup();
      scrollTo(scroller, 30);
      scrollIntoView.mockClear();
      act(() => emit()('token', 'Streaming along'));
      await screen.findByText(/Streaming along/);
      // The token reaches state on a requestAnimationFrame, outside act(), so React may
      // commit the text before it flushes the passive effect that follows the thread.
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    });

    it('does not pull a reader who scrolled up back to the bottom', async () => {
      const { scrollIntoView, scroller, emit } = await setup();
      scrollTo(scroller, 1300);
      scrollIntoView.mockClear();
      act(() => emit()('token', 'Streaming along'));
      await screen.findByText(/Streaming along/);
      act(() => emit()('token', ' and further'));
      await screen.findByText(/and further/);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('scrolls to a newly submitted question even after scrolling up', async () => {
      const { scrollIntoView, scroller, ask, emit, finish } = await setup();
      await act(async () => {
        emit()('token', 'Done answer');
        emit()('done', {});
        finish()();
      });
      await screen.findByText('Done answer');
      scrollTo(scroller, 1300);
      scrollIntoView.mockClear();
      await ask('second');
      await screen.findByText('second');
      expect(scrollIntoView).toHaveBeenCalled();
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
