import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { HeritageEntryReceived } from '../HeritageEntryReceived';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@react-pdf/renderer', () => ({
  PDFDownloadLink: ({ children }: { children: (p: { loading: boolean }) => React.ReactNode }) =>
    children({ loading: false }),
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  Image: () => null,
}));

// ─── Fixture ──────────────────────────────────────────────────────────────────

const DOG = {
  id: 'dog-1',
  registeredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  callName: 'Cooper',
  classSummary: 'Excellent · Containers, Interiors, Buried',
};

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogs: [DOG],
  totalFeesFormatted: '$69.00',
  totalLabel: 'Total · Paid by check',
  registrationNumber: 'MK9-000427',
  fullConfirmationNote:
    'Once the show secretary accepts your entry, we will email you a full confirmation with your armband number, judge and directions.',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HeritageEntryReceived', () => {
  it('renders the submitted heading', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    // h2 has an <em> child — use role query which checks full accessible name
    expect(screen.getByRole('heading', { name: /submitted/i })).toBeTruthy();
  });

  it('displays club name', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('Bexar County Kennel Club')).toBeTruthy();
  });

  it('displays show name', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Spring Scent Work Trial/)).toBeTruthy();
  });

  it('displays class summary', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getAllByText(
        (_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('Excellent · Containers')
      ).length
    ).toBeGreaterThan(0);
  });

  it('displays dog name', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    // Call name appears inside a paragraph — getAllByText handles parent elements sharing the text
    expect(
      screen.getAllByText(
        (_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('Cooper')
      ).length
    ).toBeGreaterThan(0);
  });

  it('displays total fees', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeTruthy();
  });

  it('displays the enrollment confirmation number with the confirmation label', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Confirmation number MK9-000427/)).toBeTruthy();
    expect(screen.queryByText(/Entry #/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Registration #/)).not.toBeInTheDocument();
  });

  it('displays confirmation date caption', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/we will email you a full confirmation/)).toBeTruthy();
  });

  it('renders "Print my entry blank" button', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} onPrintEntryBlank={() => {}} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('"Print my entry blank" is disabled when onPrintEntryBlank is not provided', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onPrintEntryBlank when button clicked', async () => {
    const onPrint = vi.fn();
    render(<HeritageEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    await userEvent.click(screen.getByRole('button', { name: /print my entry blank/i }));
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it('renders "Return to dashboard" button', () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /return to dashboard/i })).toBeTruthy();
  });

  it('navigates on "Return to dashboard" click', async () => {
    render(<HeritageEntryReceived {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
