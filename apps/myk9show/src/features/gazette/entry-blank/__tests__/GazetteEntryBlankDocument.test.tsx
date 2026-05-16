import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GazetteEntryBlankDocument } from '../GazetteEntryBlankDocument';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';

// ─── Mock @react-pdf/renderer ─────────────────────────────────────────────────
// Same stub shape used by the Heritage PDF test — render Document/Page/View as
// divs and Text as spans so jsdom can introspect the section folios and label
// text without spinning up a real PDF renderer.
vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-page">{children}</div>
  ),
  View: ({ children, style: _s }: { children?: React.ReactNode; style?: unknown }) => (
    <div>{children}</div>
  ),
  Text: ({ children, style: _s }: { children?: React.ReactNode; style?: unknown }) => (
    <span>{children}</span>
  ),
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  PDFDownloadLink: ({ children }: { children: (p: { loading: boolean }) => React.ReactNode }) =>
    children({ loading: false }),
}));

const BASE_OPTS = {
  show: {
    name: 'Spring Scent Work Trial',
    start_date: '2026-06-12',
    end_date: '2026-06-14',
    entry_close_date: '2026-06-03',
    pre_entry_fee: 25,
    organization: 'AKC',
  },
  trials: [
    {
      id: 'trial-1',
      date: '2026-06-12',
      trial_number: 'I',
      display_order: 1,
      timezone: 'America/Chicago',
    },
  ],
  classes: [
    {
      id: 'cls-1',
      trial_id: 'trial-1',
      element: 'Containers',
      level: 'Novice',
      name: 'Containers',
    },
  ],
  judges: [{ trial_id: 'trial-1', judgeName: 'Mrs. Beagles' }],
  club: { name: 'Bexar County Kennel Club' },
  secretary: {
    name: 'James Nakamura',
    poBox: 'PO Box 4421',
    cityStateZip: 'San Antonio, TX 78212',
    email: 'secretary@bckc.org',
  },
};

describe('GazetteEntryBlankDocument', () => {
  it('renders a pdf-document root', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByTestId('pdf-document')).toBeTruthy();
  });

  it('renders the club name in the masthead', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    const { container } = render(<GazetteEntryBlankDocument {...props} />);
    // The italic-articles masthead splits "Bexar County Kennel Club" across
    // separate <em> tags, so the words are distributed across DOM nodes.
    // Both "Bexar" and "Kennel" also appear inside the AKC agreement
    // paragraph copy, so `getAllByText` is required. The masthead itself
    // is verified by checking that one element with each word exists.
    expect(screen.getAllByText(/Bexar/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Club/).length).toBeGreaterThan(0);
    // The joined textContent of the whole document should contain the
    // full club name in order (proves the masthead reassembles correctly).
    expect(container.textContent).toContain('Bexar County Kennel Club');
  });

  it('renders the show title in the section head', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText(/Spring Scent Work Trial/)).toBeTruthy();
  });

  it('renders the lowercase-roman section folio i. (dog particulars)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('i.')).toBeTruthy();
  });

  it('renders the lowercase-roman section folio ii. (classes entered)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('ii.')).toBeTruthy();
  });

  it('renders the lowercase-roman section folio iii. (owner & handler)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('iii.')).toBeTruthy();
  });

  it('renders the lowercase-roman section folio iv. (fees)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('iv.')).toBeTruthy();
  });

  it('renders the lowercase-roman section folio v. (agreement)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('v.')).toBeTruthy();
  });

  it('renders the AKC agreement first paragraph', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    const matches = screen.getAllByText(/I certify/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders secretary name in mail-to panel', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('James Nakamura')).toBeTruthy();
  });

  it('renders judge name in classes-entered table', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    expect(screen.getByText('Mrs. Beagles')).toBeTruthy();
  });

  it('renders the lowercase trial numeral in the classes table', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<GazetteEntryBlankDocument {...props} />);
    // Trial number 'I' is lower-cased to 'i' in the Gazette PDF (matches the
    // lowercase-roman folio convention of the rest of the document).
    expect(screen.getByText('i')).toBeTruthy();
  });
});
