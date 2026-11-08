import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAnswer } from '@/components/askq/AskQAnswer';
import { AskQAppHelpContent } from '@/components/askq/AskQAppHelpContent';
import type { SupportHelpState } from '@/features/support/useSupportHelp';

const MARKDOWN =
  '## Withdrawing\n\n**Withdraw** moves you off the list.\n\n---\n\n1. Open My Shows\n2. Tap Leave class\n\n- Fee: 2 * $35';

function helpState(answer: string): SupportHelpState {
  return {
    status: 'answered',
    question: 'How?',
    answer,
    toolsUsed: [],
    sources: {},
    route: { kind: 'answer', answer, deepLink: null, sources: {} },
    ticket: null,
    error: null,
  };
}

function expectNoMarkdown(container: HTMLElement) {
  const text = container.textContent ?? '';
  expect(text).not.toContain('#');
  expect(text).not.toContain('**');
  expect(text).not.toContain('---');
  expect(text).toContain('Withdraw moves you off the list.');
  expect(text).toContain('1. Open My Shows');
  expect(text).toContain('2 * $35');
}

describe('AskQ plain-text answers (MYK9-1774)', () => {
  it('AskQAnswer shows no Markdown syntax', () => {
    const { container } = render(
      <AskQAnswer query="q" answer={MARKDOWN} toolsUsed={[]} isStreaming={false} />
    );
    expectNoMarkdown(container);
  });

  it('AskQAppHelpContent shows no Markdown syntax', () => {
    const { container } = render(
      <AskQAppHelpContent currentUserId={null} onEscalate={() => {}} state={helpState(MARKDOWN)} />
    );
    expectNoMarkdown(container);
  });

  it('renders HTML in an answer as inert text', () => {
    const evil = '<img src=x onerror=alert(1)> <script>alert(2)</script>';
    const { container } = render(
      <AskQAnswer query="q" answer={evil} toolsUsed={[]} isStreaming={false} />
    );
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
  });

  it('renders HTML in an app-help answer as inert text', () => {
    const evil = '<img src=x onerror=alert(1)> <script>alert(2)</script>';
    const { container } = render(
      <AskQAppHelpContent currentUserId={null} onEscalate={() => {}} state={helpState(evil)} />
    );
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
