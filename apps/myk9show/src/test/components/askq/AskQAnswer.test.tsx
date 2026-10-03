// apps/myk9show/src/test/components/askq/AskQAnswer.test.tsx
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAnswer } from '@/components/askq/AskQAnswer';
import { TERA_WORKING_COPY } from '@/components/askq/askq-config';

describe('AskQAnswer', () => {
  it('renders the user query bubble', () => {
    render(<AskQAnswer query="How did Buddy do?" answer="" toolsUsed={[]} isStreaming={false} />);
    expect(screen.getByText('How did Buddy do?')).toBeInTheDocument();
  });

  it('renders the answer text', () => {
    render(
      <AskQAnswer
        query="test"
        answer="Buddy qualified in Excellent!"
        toolsUsed={[]}
        isStreaming={false}
      />
    );
    expect(screen.getByText('Buddy qualified in Excellent!')).toBeInTheDocument();
  });

  it('shows tool badges', () => {
    render(
      <AskQAnswer
        query="test"
        answer="Answer text"
        toolsUsed={['get_class_summary', 'get_entry_results']}
        isStreaming={false}
      />
    );
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('shows streaming cursor while streaming', () => {
    const { container } = render(
      <AskQAnswer query="test" answer="Partial ans" toolsUsed={[]} isStreaming={true} />
    );
    expect(container.querySelector('[data-testid="streaming-cursor"]')).toBeInTheDocument();
  });

  it('hides streaming cursor when done', () => {
    const { container } = render(
      <AskQAnswer query="test" answer="Full answer" toolsUsed={[]} isStreaming={false} />
    );
    expect(container.querySelector('[data-testid="streaming-cursor"]')).not.toBeInTheDocument();
  });

  it('shows Tera working while no answer has arrived yet', () => {
    render(<AskQAnswer query="test" answer="" toolsUsed={[]} isStreaming={true} />);
    expect(screen.getByRole('status', { name: TERA_WORKING_COPY })).toBeInTheDocument();
  });

  it('shows nothing extra once idle with no answer', () => {
    render(<AskQAnswer query="test" answer="" toolsUsed={[]} isStreaming={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it("shows Tera's face as the sender mark next to each answer", () => {
    render(
      <AskQAnswer
        query="test"
        answer="Buddy qualified in Excellent!"
        toolsUsed={[]}
        isStreaming={false}
      />
    );
    expect(screen.getByTestId('tera-face')).toBeInTheDocument();
  });

  describe('Found it (MYK9-851)', () => {
    // The reduced-motion case swaps matchMedia; put the setup.ts default back so
    // a shuffled order cannot leak it into the motion-allowed cases.
    const defaultMatchMedia = window.matchMedia;
    afterEach(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: defaultMatchMedia,
      });
    });

    function renderStreamingThenDone() {
      const props = { query: 'q', answer: 'Buddy qualified.', toolsUsed: [] as string[] };
      const view = render(<AskQAnswer {...props} isStreaming={true} />);
      view.rerender(<AskQAnswer {...props} isStreaming={false} isComplete />);
      return view;
    }

    // Codex P2: leaving streaming is not success. A network failure after
    // partial text must keep the plain face.
    it('does not play when streaming ends without a successful completion', () => {
      const props = { query: 'q', answer: 'Partial answ', toolsUsed: [] as string[] };
      const view = render(<AskQAnswer {...props} isStreaming={true} />);
      view.rerender(<AskQAnswer {...props} isStreaming={false} isComplete={false} />);
      expect(screen.queryByTestId('tera-found-it')).toBeNull();
      expect(screen.getByTestId('tera-face')).toBeInTheDocument();
    });

    // Codex P2: tokens and done can land in one frame, so the answer text and
    // its mark mount already complete. The answer itself saw the pending state.
    it('plays when the whole answer and completion land in one update', () => {
      const props = { query: 'q', toolsUsed: [] as string[] };
      const view = render(<AskQAnswer {...props} answer="" isStreaming={true} />);
      view.rerender(<AskQAnswer {...props} answer="All at once." isStreaming={false} isComplete />);
      expect(screen.getByTestId('tera-found-it')).toBeInTheDocument();
    });

    it('plays once when the answer finishes streaming, then settles on the face', () => {
      const { container } = renderStreamingThenDone();

      // The answer text is already on screen; Found it never holds it back.
      expect(screen.getByText('Buddy qualified.')).toBeInTheDocument();
      expect(screen.getByTestId('tera-found-it')).toBeInTheDocument();
      expect(screen.queryByTestId('tera-face')).toBeNull();

      fireEvent.ended(container.querySelector('video') as HTMLVideoElement);
      expect(screen.queryByTestId('tera-found-it')).toBeNull();
      expect(screen.getByTestId('tera-face')).toBeInTheDocument();
    });

    it('does not play for an answer that was already complete when shown', () => {
      render(
        <AskQAnswer
          query="q"
          answer="Done earlier."
          toolsUsed={[]}
          isStreaming={false}
          isComplete
        />
      );
      expect(screen.queryByTestId('tera-found-it')).toBeNull();
      expect(screen.getByTestId('tera-face')).toBeInTheDocument();
    });

    it('keeps the static face under reduced motion', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn((query: string) => ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
      renderStreamingThenDone();
      expect(screen.queryByTestId('tera-found-it')).toBeNull();
      expect(screen.getByTestId('tera-face')).toBeInTheDocument();
    });
  });
});
