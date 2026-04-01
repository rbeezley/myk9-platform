// apps/myk9show/src/test/components/askq/AskQAnswer.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAnswer } from '@/components/askq/AskQAnswer';

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
        toolsUsed={['search_rules', 'get_entry_results']}
        isStreaming={false}
      />
    );
    expect(screen.getByText('Rules')).toBeInTheDocument();
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

  it('shows loading skeleton when no answer yet and streaming', () => {
    render(<AskQAnswer query="test" answer="" toolsUsed={[]} isStreaming={true} />);
    expect(screen.getByTestId('answer-skeleton')).toBeInTheDocument();
  });
});
