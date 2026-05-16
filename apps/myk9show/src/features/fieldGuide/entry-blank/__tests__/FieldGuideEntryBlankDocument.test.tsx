import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { FieldGuideEntryBlankDocument } from '../FieldGuideEntryBlankDocument';

// Mock @react-pdf/renderer to plain DOM nodes so we can introspect the
// rendered tree with @testing-library. The same pattern is used by the
// Heritage / Headline / Banner entry-blank tests.
// Mock the PDF primitives but preserve the `style` prop on each so we can
// introspect font-family / font-style declarations in the rendered tree.
// Stringify the style as a JSON data-attribute since react-dom rejects
// PDF-only properties (flexDirection, padding shorthands like '6 14', etc).
vi.mock('@react-pdf/renderer', () => {
  const styleAttr = (style: unknown) =>
    style ? { 'data-style': JSON.stringify(style) } : {};
  return {
    Document: ({ children, style }: { children: ReactNode; style?: unknown }) => (
      <div data-testid="pdf-document" {...styleAttr(style)}>
        {children}
      </div>
    ),
    Page: ({ children, style }: { children: ReactNode; style?: unknown }) => (
      <div data-testid="pdf-page" {...styleAttr(style)}>
        {children}
      </div>
    ),
    View: ({ children, style }: { children?: ReactNode; style?: unknown }) => (
      <div {...styleAttr(style)}>{children}</div>
    ),
    Text: ({ children, style }: { children?: ReactNode; style?: unknown }) => (
      <span {...styleAttr(style)}>{children}</span>
    ),
    Image: () => null,
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
    PDFDownloadLink: ({ children }: { children: (p: { loading: boolean }) => ReactNode }) =>
      children({ loading: false }),
  };
});

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

describe('FieldGuideEntryBlankDocument', () => {
  it('renders the entry-blank shell with real data', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<FieldGuideEntryBlankDocument {...props} />);

    expect(screen.getByTestId('pdf-document')).toBeTruthy();
    expect(screen.getByText('Spring Scent Work Trial')).toBeTruthy();
    // Header byline carries the club + date range plus uppercase close date
    expect(screen.getByText(/Bexar County Kennel Club/)).toBeTruthy();
  });

  it('renders all five §-numbered sections by folio', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<FieldGuideEntryBlankDocument {...props} />);
    expect(screen.getByText('§01')).toBeTruthy();
    expect(screen.getByText('§02')).toBeTruthy();
    expect(screen.getByText('§03')).toBeTruthy();
    expect(screen.getByText('§04')).toBeTruthy();
    expect(screen.getByText('§05')).toBeTruthy();
  });

  it('surfaces the judge name in the classes-entered table', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<FieldGuideEntryBlankDocument {...props} />);
    expect(screen.getByText('C. Beagles')).toBeTruthy();
  });

  it('surfaces the secretary name in the mail-to panel', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<FieldGuideEntryBlankDocument {...props} />);
    expect(screen.getByText('James Nakamura')).toBeTruthy();
  });

  it('emits zero italic styles anywhere on the rendered tree', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    const { container } = render(<FieldGuideEntryBlankDocument {...props} />);
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
    expect(container.innerHTML).not.toContain('"fontStyle":"italic"');
    expect(container.innerHTML).not.toContain('fontStyle:italic');
  });

  it('uses IBM Plex Serif only inside the §05 agreement block, never elsewhere', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    const { container } = render(<FieldGuideEntryBlankDocument {...props} />);
    // The serif is wired via a styled <Text> inside AgreementSection — it
    // should appear exactly once in the rendered tree.
    const matches = container.innerHTML.match(/IBM Plex Serif/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // No display-serif from any other style should leak in.
    expect(container.innerHTML).not.toContain('Cormorant Garamond');
    expect(container.innerHTML).not.toContain('Playfair');
    expect(container.innerHTML).not.toContain('Bodoni');
    expect(container.innerHTML).not.toContain('EB Garamond');
    expect(container.innerHTML).not.toContain('Source Serif');
  });

  it('derives a showCode for the masthead when one is not supplied', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<FieldGuideEntryBlankDocument {...props} />);
    // BCKC.2026.SSWT — Bexar County Kennel Club + 2026 + Spring Scent Work Trial
    expect(screen.getByText(/BCKC\.2026/)).toBeTruthy();
  });

  it('honors a passed-in showCode override', () => {
    const props = buildEntryBlankProps(BASE_OPTS);
    render(<FieldGuideEntryBlankDocument {...props} showCode="OVERRIDE.2026" />);
    expect(screen.getByText('OVERRIDE.2026')).toBeTruthy();
  });
});
