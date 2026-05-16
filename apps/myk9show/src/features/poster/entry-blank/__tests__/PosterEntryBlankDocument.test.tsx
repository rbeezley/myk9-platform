import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PosterEntryBlankDocument } from '../PosterEntryBlankDocument';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';

// ─── Mock @react-pdf/renderer ─────────────────────────────────────────────────
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

// ─── Fixture ──────────────────────────────────────────────────────────────────

const BASE_OPTS = {
  show: {
    name: 'Spring Scent Work Trial',
    start_date: '2026-06-12',
    end_date: '2026-06-14',
    entry_close_date: '2026-06-03',
    pre_entry_fee: 25,
    day_of_show_fee: 22,
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
    { id: 'c-1', trial_id: 'trial-1', element: 'Containers', level: 'Novice', name: 'C' },
    { id: 'c-2', trial_id: 'trial-1', element: 'Interiors', level: 'Excellent', name: 'I' },
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

describe('PosterEntryBlankDocument', () => {
  it('renders a pdf-document root', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByTestId('pdf-document')).toBeTruthy();
  });

  it('renders the club name in the header strip (uppercased)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText(/BEXAR COUNTY KENNEL CLUB/)).toBeTruthy();
  });

  it('renders the show title in the masthead (uppercased)', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('SPRING SCENT WORK TRIAL')).toBeTruthy();
  });

  it('renders the §01 dog particulars section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('01.')).toBeTruthy();
    expect(screen.getByText(/PARTICULARS OF THE DOG/)).toBeTruthy();
  });

  it('renders the §02 classes-entered section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('02.')).toBeTruthy();
    expect(screen.getByText(/CLASSES ENTERED/)).toBeTruthy();
  });

  it('renders the §03 owner & handler section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('03.')).toBeTruthy();
    expect(screen.getByText(/OWNER & HANDLER/)).toBeTruthy();
  });

  it('renders the §04 fees section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('04.')).toBeTruthy();
    expect(screen.getByText(/FEES TENDERED/)).toBeTruthy();
  });

  it('renders the §05 agreement section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('05.')).toBeTruthy();
    expect(screen.getByText(/AGREEMENT & SIGNATURE/)).toBeTruthy();
  });

  it('renders the trial numerals from the data', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('I')).toBeTruthy();
    expect(screen.getByText('II')).toBeTruthy();
  });

  it('renders the judges in the trial table', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('C. Beagles')).toBeTruthy();
    expect(screen.getByText('M. Whitfield')).toBeTruthy();
  });

  it('renders the mail-to panel with secretary uppercased', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<PosterEntryBlankDocument {...props} />);
    expect(screen.getByText('JAMES NAKAMURA')).toBeTruthy();
    expect(screen.getByText('secretary@bckc.org')).toBeTruthy();
  });
});
