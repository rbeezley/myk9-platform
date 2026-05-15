import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonogramEntryBlankDocument } from '../MonogramEntryBlankDocument';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-page">{children}</div>
  ),
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
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
  judges: [{ trial_id: 'trial-1', judgeName: 'C. Beagles' }],
  club: { name: 'Bexar County Kennel Club' },
  secretary: {
    name: 'James Nakamura',
    poBox: 'PO Box 4421',
    cityStateZip: 'San Antonio, TX 78212',
    email: 'secretary@bckc.org',
  },
};

describe('MonogramEntryBlankDocument', () => {
  it('renders a pdf-document root', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    expect(screen.getByTestId('pdf-document')).toBeTruthy();
  });

  it('renders the embossed-monogram bleed letters derived from the club name', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    // Bexar County Kennel Club → "BCK" — appears both in header (56pt) and
    // bleed (540pt). Both should be present.
    const matches = screen.getAllByText('BCK');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders lowercase-roman folios (i, ii, iii, iv, v) in section headers', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    expect(screen.getByText('i')).toBeTruthy();
    expect(screen.getByText('ii')).toBeTruthy();
    expect(screen.getByText('iii')).toBeTruthy();
    expect(screen.getByText('iv')).toBeTruthy();
    expect(screen.getByText('v')).toBeTruthy();
  });

  it('renders the show title in the header', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    expect(screen.getByText('Spring Scent Work Trial')).toBeTruthy();
  });

  it('renders the AKC agreement first paragraph (starts with "I certify")', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    const matches = screen.getAllByText(/I certify/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders the secretary name in the mail-to panel', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    expect(screen.getByText('James Nakamura')).toBeTruthy();
  });

  it('renders the trial judge name in the classes-entered section', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MonogramEntryBlankDocument {...props} />);
    expect(screen.getByText('C. Beagles')).toBeTruthy();
  });

  it('reuses Heritage buildEntryBlankProps without modification (shared data layer)', () => {
    // This is a structural assertion — if `buildEntryBlankProps` ever stops
    // returning a complete `EntryBlankProps` the document will fail to render.
    const props = buildEntryBlankProps(BASE_OPTS);
    expect(props.clubName).toBe('Bexar County Kennel Club');
    expect(props.trials.length).toBe(1);
    expect(props.fees.firstEntryFee).toBeTruthy();
    expect(props.agreementText.length).toBeGreaterThan(20);
  });
});
