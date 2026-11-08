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

  it('keeps the link label and https/mailto url as plain text, drops other schemes', () => {
    const { container } = renderAnswer(
      'A [site](https://example.com/x) B [mail](mailto:a@b.com) C [bad](ftp://x.com) D ![pic](https://x.com/i.png)'
    );
    expect(container.querySelector('a')).toBeNull();
    const bubble = container.querySelector('.bg-muted\\/50') as HTMLElement;
    expect(bubble.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(
      'A site (https://example.com/x) B mail (mailto:a@b.com) C bad D pic'
    );
    expect(container.textContent).not.toContain('ftp');
    expect(container.textContent).not.toContain('!');
  });

  it('exposes headings with role and level', () => {
    renderAnswer('## Title\n\nBody');
    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeInTheDocument();
  });

  it('keeps ordered list numbering across blank lines and nested bullets', () => {
    const { container } = renderAnswer(
      '1. First\n\n2. Second\n   - nested a\n   - nested b\n\n3. Third\n\n5. Skip'
    );
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);
    expect(container.querySelectorAll('ol > li:nth-child(2) > ul > li')).toHaveLength(2);
  });

  it('preserves the source number with start=', () => {
    const { container } = renderAnswer('Intro\n\n3. Three\n4. Four');
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('3');
  });

  it('places the streaming cursor inside the last block', () => {
    const { container } = renderAnswer('Hello\n\nlast words', true);
    const cursor = screen.getByTestId('streaming-cursor');
    expect(cursor.parentElement?.tagName).toBe('P');
    expect(cursor.parentElement?.textContent).toBe('last words');
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  describe.each([
    ['heading inside a list item', '- ## Title\n- Other', ['Title', 'Other']],
    ['bare hashes', '##\nHello\n#', ['Hello']],
    ['heading marker alone mid stream', 'Hello\n\n#', ['Hello']],
    ['indented heading', '      ## Deep title', ['Deep title']],
    ['table', '| Name | Age |\n|---|---|\n| Rex | 3 |', ['Name · Age', 'Rex · 3']],
    ['aligned table separator', '| a | b |\n| :--- | ---: |\n| c | d |', ['a · b', 'c · d']],
    ['bold italic', 'x ***both*** y', ['x both y']],
    ['bold with nested italic', '**a *b* c**', ['a b c']],
    ['underscore bold', '__bold__ word', ['bold word']],
    ['underscore italic', 'an _italic_ word', ['an italic word']],
    ['half-streamed bold', 'a **bold*', ['a bold']],
    ['fenced code', '```\n# not a heading\nplain line\n```', ['not a heading', 'plain line']],
  ])('syntax does not leak: %s', (_name, input, words) => {
    it('shows the words and no markers', () => {
      const { container } = renderAnswer(input);
      const visible = container.textContent ?? '';
      expect(visible).not.toMatch(/#|\*|_|\|---|---/);
      for (const word of words) expect(visible).toContain(word);
    });
  });

  it('leaves snake_case words alone', () => {
    const { container } = renderAnswer('use entry_status and my_dog_name here');
    expect(container.textContent).toContain('entry_status and my_dog_name');
  });
});
