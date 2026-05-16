import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { MagazineEntryReceived } from '../MagazineEntryReceived';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Fixture ──────────────────────────────────────────────────────────────────

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  classSummary: 'Excellent · Containers, Interiors, Buried',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: '6 June 2026',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MagazineEntryReceived', () => {
  it('renders "Your entry is received" heading', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /received/i })).toBeTruthy();
  });

  it('renders the "Confirmed · Receipt …" kicker when registrationNumber present', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Confirmed · Receipt 2026-0137/)).toBeTruthy();
  });

  it('renders bare "Confirmed" kicker when registrationNumber is null', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} registrationNumber={null} />);
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('renders club + show + date range in the byline', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Bexar County Kennel Club/)).toBeTruthy();
    expect(screen.getByText(/Spring Scent Work Trial/)).toBeTruthy();
    expect(screen.getByText(/12–14 June 2026/)).toBeTruthy();
  });

  it('renders the dog registered name and call name', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/GCh\. Ridgeway/)).toBeTruthy();
    expect(
      screen.getAllByText(
        (_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('Cooper')
      ).length
    ).toBeGreaterThan(0);
  });

  it('renders class summary', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getAllByText(
        (_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('Excellent · Containers')
      ).length
    ).toBeGreaterThan(0);
  });

  it('renders the total fees', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeTruthy();
  });

  it('renders the "Receipt №" label when registrationNumber is set', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Receipt № 2026-0137/)).toBeTruthy();
  });

  it('renders "Fees received" instead of "Receipt №" when no number', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} registrationNumber={null} />);
    expect(screen.getByText('Fees received')).toBeTruthy();
  });

  it('renders confirmation date caption', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/6 June 2026/)).toBeTruthy();
  });

  it('renders "Print my entry blank" button enabled when handler is provided', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} onPrintEntryBlank={() => {}} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables print button when no handler is provided', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    expect(
      (screen.getByRole('button', { name: /print my entry blank/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('calls onPrintEntryBlank when print button clicked', async () => {
    const onPrint = vi.fn();
    render(<MagazineEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    await userEvent.click(screen.getByRole('button', { name: /print my entry blank/i }));
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it('navigates home when "Return to dashboard" is clicked', async () => {
    render(<MagazineEntryReceived {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('omits the caption when confirmationDateLabel is null', () => {
    render(<MagazineEntryReceived {...BASE_PROPS} confirmationDateLabel={null} />);
    expect(screen.queryByText(/A formal confirmation will be emailed/)).toBeNull();
    // Header still renders.
    expect(screen.getByRole('heading', { name: /received/i })).toBeTruthy();
  });
});
