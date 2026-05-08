import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeritageEntryBlankDocument } from '../HeritageEntryBlankDocument';
import { buildEntryBlankProps } from '../buildEntryBlankProps';

// ─── Mock @react-pdf/renderer ─────────────────────────────────────────────────
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

// ─── Fixture ──────────────────────────────────────────────────────────────────

const BASE_OPTS = {
  show: {
    name: 'Spring Scent Work Trial',
    start_date: '2026-06-12',
    end_date: '2026-06-14',
    entry_close_date: '2026-06-03',
    pre_entry_fee: 25,
    day_of_show_fee: 28,
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

describe('HeritageEntryBlankDocument', () => {
  it('renders a pdf-document root', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByTestId('pdf-document')).toBeTruthy();
  });

  it('renders club name in the header', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByText('Bexar County Kennel Club')).toBeTruthy();
  });

  it('renders §I section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByText('§ I')).toBeTruthy();
  });

  it('renders §II section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByText('§ II')).toBeTruthy();
  });

  it('renders §III section folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByText('§ III')).toBeTruthy();
  });

  it('renders §V agreement section with certify text', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    // First paragraph of AKC agreement starts with "I certify"
    const matches = screen.getAllByText(/I certify/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders secretary name in mail panel', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByText('James Nakamura')).toBeTruthy();
  });

  it('renders trial judge name in §II', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeritageEntryBlankDocument {...props} />);
    expect(screen.getByText('C. Beagles')).toBeTruthy();
  });
});
