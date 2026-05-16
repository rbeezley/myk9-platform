import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MagazineEntryBlankDocument } from '../MagazineEntryBlankDocument';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank';

// ─── Mock @react-pdf/renderer ─────────────────────────────────────────────────
vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-page">{children}</div>
  ),
  View: ({ children }: { children?: React.ReactNode; style?: unknown }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode; style?: unknown }) => (
    <span>{children}</span>
  ),
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  PDFDownloadLink: ({ children }: { children: (p: { loading: boolean }) => React.ReactNode }) =>
    children({ loading: false }),
}));

// ─── Fixture ──────────────────────────────────────────────────────────────────

const BASE_OPTS = {
  show: {
    name: 'Spring Scent Work',
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
    {
      id: 'trial-2',
      date: '2026-06-13',
      trial_number: 'II',
      display_order: 2,
      timezone: 'America/Chicago',
    },
  ],
  classes: [
    { id: 'cls-1', trial_id: 'trial-1', element: 'Containers', level: 'Novice', name: 'Containers' },
  ],
  judges: [
    { trial_id: 'trial-1', judgeName: 'C. Beagles' },
    { trial_id: 'trial-2', judgeName: 'M. Whitfield' },
  ],
  club: { name: 'Bexar County Kennel Club' },
  secretary: {
    name: 'James Nakamura',
    poBox: 'PO Box 4421',
    cityStateZip: 'San Antonio, TX 78212',
    email: 'secretary@bckc.org',
  },
};

describe('MagazineEntryBlankDocument', () => {
  it('renders a pdf-document root', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getByTestId('pdf-document')).toBeTruthy();
  });

  it('renders the club name in the header', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    // Club name appears in header dek and again in mail-to panel; getAllByText
    // tolerates the multiple matches.
    expect(screen.getAllByText(/Bexar County Kennel Club/).length).toBeGreaterThan(0);
  });

  it('renders the i section folio numeral', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    // "i" appears in the §I folio AND in the "Page i of i" foot rule.
    expect(screen.getAllByText('i').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the ii section folio numeral', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getAllByText('ii').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the v agreement section folio numeral', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getAllByText('v').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the AKC agreement first paragraph', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getAllByText(/I certify/i).length).toBeGreaterThan(0);
  });

  it('renders the secretary in the mail-to panel', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getByText('James Nakamura')).toBeTruthy();
  });

  it('renders judge names in §II rows', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getByText('C. Beagles')).toBeTruthy();
    expect(screen.getByText('M. Whitfield')).toBeTruthy();
  });

  it('renders the magazine "Official Entry Blank · Mail-In" header line', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<MagazineEntryBlankDocument {...props} />);
    expect(screen.getByText(/Official Entry Blank · Mail-In/i)).toBeTruthy();
  });
});
