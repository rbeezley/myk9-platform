/**
 * MYK9-631 round 1, lens L (P1): the printed receipt's `<title>` is built by
 * string concatenation and handed to `document.write` on an `about:blank`
 * popup that inherits the app's origin.
 *
 * Before this PR the interpolated value was a system-generated confirmation
 * number. This PR replaced it with the dog and show names — and `shows.name` is
 * authored by a club admin or secretary, i.e. a DIFFERENT user from the
 * exhibitor who clicks Print. That is a stored-XSS shape, not self-XSS.
 *
 * These tests read the written markup itself, which no other test does: the
 * fragment sweep in `exhibitorIdFragments.test.tsx` collects
 * `document.body.textContent` plus `aria-label`s, so the printed document's
 * head is outside every existing collector.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryReceipt } from './EntryReceipt';

/** The payload lens L verified against the real template. */
const BREAKOUT = 'Fall Classic</title><img src=x onerror=alert(document.domain)>';

const entry = {
  id: 'ff090774-c45b-4c5b-b10c-ec4c067e6a28',
  showName: 'Flint Hills Fall Classic',
  showDate: new Date('2026-11-14T00:00:00'),
  location: { venue: 'Expo Hall', city: 'Tulsa', state: 'Oklahoma' },
  dogName: 'Juni',
  classes: [
    { id: 'c-1', name: 'Interior Advanced', number: '', fee: 25, status: 'entered' as const },
  ],
  totalFee: 25,
  submittedAt: new Date('2026-09-16T12:00:00'),
  paymentStatus: 'Paid',
};

/**
 * The real property, checked by PARSING the written markup rather than
 * string-matching it: no element the payload tried to inject exists in the
 * document the popup would build. A substring assertion on `onerror=` would be
 * wrong — that text survives, inert, as the title's own text content once the
 * angle brackets are escaped, and asserting on it would fail a correct fix.
 */
function injectedElements(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('img, script, iframe, svg, object, embed')).map(node =>
    node.tagName.toLowerCase()
  );
}

/** Capture exactly what `handlePrint` writes into the popup. */
function capturePrintedHtml() {
  const write = vi.fn();
  const printWindow = {
    document: { write, close: vi.fn(), title: '' },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);
  return () => String(write.mock.calls[0]?.[0] ?? '');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EntryReceipt — the printed document escapes every interpolated value', () => {
  it('cannot be broken out of by a club-authored show name', async () => {
    const printed = capturePrintedHtml();
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{ ...entry, showName: BREAKOUT, confirmationNumber: 'MK9-000145' }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    const html = printed();

    // Positive control: the print really happened and the title is there.
    expect(html).toContain('<title>Entry Receipt - ');
    // The payload builds no element at all.
    expect(injectedElements(html)).toEqual([]);
    // The title element is not closed early, so nothing escapes into <head>.
    expect(html.match(/<\/title>/g) ?? []).toHaveLength(1);
    // The characters are still carried, escaped, so the title stays truthful.
    expect(html).toContain('&lt;img src=x');
    // And the parsed title is the whole string, payload included as TEXT.
    const title = new DOMParser().parseFromString(html, 'text/html').title;
    expect(title).toContain('Fall Classic</title><img src=x');
  });

  // The dog name is the exhibitor's own, so this is self-XSS rather than
  // stored — but it is the same unescaped interpolation and the same fix, and
  // the payload has to carry `</title>` to be a real one: `<title>` is RCDATA,
  // so a bare `<script>` inside it is inert text either way and a test using
  // one would stay green against the unescaped template.
  it('escapes a dog name too — the other half of the same title', async () => {
    const printed = capturePrintedHtml();
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{ ...entry, dogName: 'Juni</title><script>alert(1)</script>' }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    const html = printed();

    expect(html).toContain('<title>Entry Receipt - ');
    expect(injectedElements(html)).toEqual([]);
    expect(html.match(/<\/title>/g) ?? []).toHaveLength(1);
    expect(html).toContain('&lt;script&gt;');
  });

  it('still prints an ordinary name unmangled', async () => {
    const printed = capturePrintedHtml();
    render(<EntryReceipt open onOpenChange={vi.fn()} entry={entry} />);

    await userEvent.click(screen.getByRole('button', { name: /print/i }));

    expect(printed()).toContain('<title>Entry Receipt - Juni, Flint Hills Fall Classic</title>');
  });
});
