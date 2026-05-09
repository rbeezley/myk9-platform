import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { HeadlineEntryBlankDocument } from '../HeadlineEntryBlankDocument';

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: ReactNode }) => <div data-testid="pdf-page">{children}</div>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  PDFDownloadLink: ({ children }: { children: (p: { loading: boolean }) => ReactNode }) =>
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

describe('HeadlineEntryBlankDocument', () => {
  it('renders the Headline entry blank shell with real data', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<HeadlineEntryBlankDocument {...props} />);

    expect(screen.getByTestId('pdf-document')).toBeTruthy();
    expect(screen.getByText('Entry Blank')).toBeTruthy();
    expect(screen.getByText('Spring Scent Work Trial')).toBeTruthy();
    expect(screen.getByText('Bexar County Kennel Club · 12 – 14 June 2026')).toBeTruthy();
    expect(screen.getByText('§ 01 · The dog')).toBeTruthy();
    expect(screen.getByText('C. Beagles')).toBeTruthy();
    expect(screen.getByText('James Nakamura')).toBeTruthy();
  });
});
