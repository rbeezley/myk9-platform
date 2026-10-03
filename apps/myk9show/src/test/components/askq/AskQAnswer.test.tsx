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
      view.rerender(<AskQAnswer {...props} isStreaming={false} />);
      return view;
    }

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
      render(<AskQAnswer query="q" answer="Done earlier." toolsUsed={[]} isStreaming={false} />);
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
