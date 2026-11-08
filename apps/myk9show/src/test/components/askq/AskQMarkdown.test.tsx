// apps/myk9show/src/test/components/askq/AskQMarkdown.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAnswer } from '@/components/askq/AskQAnswer';

const MARKDOWN_ANSWER = [
  "## **If it's an AKC Scent Work trial:**",
  '',
  'You can **Withdraw** before the closing date.',
  '',
  '---',
  '',
  '- Email the secretary',
  '* Keep your confirmation',
  '',
  '1. Open My Entries',
  '2. Tap *Withdraw*',
].join('\n');

function renderAnswer(answer: string, isStreaming = false) {
  return render(<AskQAnswer query="q" answer={answer} toolsUsed={[]} isStreaming={isStreaming} />);
}

describe('AskQAnswer markdown rendering (MYK9-1774)', () => {
  it('shows headings, bold and lists with no Markdown syntax characters', () => {
    const { container } = renderAnswer(MARKDOWN_ANSWER);
    const bubble = container.querySelector('.bg-muted\\/50') as HTMLElement;

    expect(bubble.textContent).not.toMatch(/#|\*|---/);
    expect(screen.getByText("If it's an AKC Scent Work trial:")).toBeInTheDocument();
    expect(screen.getByText('Withdraw', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Email the secretary')).toBeInTheDocument();
    expect(container.querySelector('hr')).toBeInTheDocument();
    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(container.querySelector('ul')).toBeInTheDocument();
  });

  it('hides a half-streamed bold marker', () => {
    const { container } = renderAnswer('You can **With', true);
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).toContain('You can With');
  });

  it('never turns raw HTML into elements (XSS-safe)', () => {
    const { container } = renderAnswer(
      'Hello <img src=x onerror="alert(1)"> <script>alert(2)</script>\n\n- <b>bold?</b>'
    );
    const bubble = container.querySelector('.bg-muted\\/50') as HTMLElement;
    expect(bubble.querySelector('img')).toBeNull();
    expect(bubble.querySelector('script')).toBeNull();
    expect(bubble.querySelector('b')).toBeNull();
    expect(bubble.textContent).toContain('<script>alert(2)</script>');
    expect(bubble.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('reduces links to their label with no anchor or javascript: URL', () => {
    const { container } = renderAnswer('See [the rules](javascript:alert(1)) now');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('See the rules now');
    expect(container.innerHTML).not.toContain('javascript:');
  });
});
