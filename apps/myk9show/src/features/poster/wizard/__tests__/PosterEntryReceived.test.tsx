import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { PosterEntryReceived } from '../PosterEntryReceived';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const BASE_PROPS = {
  showName: 'Spring Scent Work',
  clubName: 'Bexar County Kennel Club',
  dateRange: 'Jun 12–14, 2026',
  dogRegisteredName: "CH Cedarwood's Risen on Pointe RN",
  dogCallName: 'Pointe',
  classSummary: '3 runs · Excellent Containers, Excellent Interiors, Excellent Buried',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: 'Jun 6, 2026',
};

describe('PosterEntryReceived', () => {
  it('renders the "YOU\'RE IN." heading', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /you're in/i })).toBeTruthy();
  });

  it('renders the byline (uppercased) with show, club, and date range', () => {
    const { container } = render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(container.textContent).toContain('SPRING SCENT WORK');
    expect(container.textContent).toContain('BEXAR COUNTY KENNEL CLUB');
    expect(container.textContent).toContain('JUN 12–14, 2026');
  });

  it('renders the receipt number in the kicker when provided', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/NO 01 \/ CONFIRMED · RECEIPT 2026-0137/)).toBeInTheDocument();
  });

  it('omits the receipt suffix when registration number is null', () => {
    render(<PosterEntryReceived {...BASE_PROPS} registrationNumber={null} />);
    expect(screen.queryByText(/RECEIPT/)).toBeNull();
    expect(screen.getByText(/NO 01 \/ CONFIRMED/)).toBeInTheDocument();
  });

  it('renders the dog registered name in uppercase', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText("CH CEDARWOOD'S RISEN ON POINTE RN")).toBeInTheDocument();
  });

  it('renders the dog call name in uppercased curly quotes', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    // Curly double-quotes are the rendered form per the component.
    expect(screen.getByText(/“POINTE”/)).toBeInTheDocument();
  });

  it('omits the call-name line when dogCallName is null', () => {
    render(<PosterEntryReceived {...BASE_PROPS} dogCallName={null} />);
    expect(screen.queryByText(/“/)).toBeNull();
  });

  it('renders the class summary verbatim', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getByText('3 runs · Excellent Containers, Excellent Interiors, Excellent Buried')
    ).toBeInTheDocument();
  });

  it('renders the total fees in the red total slot', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeInTheDocument();
  });

  it('renders both CTAs', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /print my entry blank/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to dashboard/i })).toBeInTheDocument();
  });

  it('disables the print button when onPrintEntryBlank is undefined', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    const print = screen.getByRole('button', { name: /print my entry blank/i });
    expect((print as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the print button and invokes the callback on click', async () => {
    const onPrint = vi.fn();
    render(<PosterEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    const print = screen.getByRole('button', { name: /print my entry blank/i });
    expect((print as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(print);
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('navigates to "/" when the dashboard button is clicked', async () => {
    mockNavigate.mockClear();
    render(<PosterEntryReceived {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders the confirmation-date caption in bold', () => {
    render(<PosterEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('Jun 6, 2026')).toBeInTheDocument();
  });

  it('omits the confirmation-date caption when null', () => {
    render(<PosterEntryReceived {...BASE_PROPS} confirmationDateLabel={null} />);
    expect(screen.queryByText(/A formal confirmation will be emailed/)).toBeNull();
  });

  it('renders the decorative ink-blot in the upper-right corner', () => {
    const { getByTestId } = render(<PosterEntryReceived {...BASE_PROPS} />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.style.width).toBe('240px');
    expect(blot.style.top).toBe('-100px');
    expect(blot.style.right).toBe('-100px');
  });

  it('mounts the ink-blot in static mode (no entry animation)', () => {
    const { getByTestId } = render(<PosterEntryReceived {...BASE_PROPS} />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.className).not.toContain('po-ink-blot--animate');
  });
});
