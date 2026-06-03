import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { BannerEntryReceived } from '../BannerEntryReceived';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogRegisteredName: "GCh. Ridgeway's Wandering Trailblazer, CGC",
  dogCallName: 'Cooper',
  classSummary: '3 runs · Excellent Containers · Judge Mrs. Beagles',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: 'Jun 6, 2026',
};

describe('BannerEntryReceived', () => {
  it('renders the ready-to-submit heading', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /ready to submit/i })).toBeTruthy();
  });

  it('renders the byline with show name, club name, and date range', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getByText(/Spring Scent Work Trial · Bexar County Kennel Club · 12–14 June 2026/)
    ).toBeInTheDocument();
  });

  it('renders the entry number in the kicker when provided', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Ready to submit · Entry 2026-0137/)).toBeInTheDocument();
  });

  it('omits the entry suffix when registration number is null', () => {
    render(<BannerEntryReceived {...BASE_PROPS} registrationNumber={null} />);
    expect(screen.queryByText(/Entry 2026/)).toBeNull();
    expect(screen.getByRole('heading', { name: /Ready to submit/ })).toBeInTheDocument();
  });

  it('renders the dog registered name', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getByText("GCh. Ridgeway's Wandering Trailblazer, CGC")
    ).toBeInTheDocument();
  });

  it('renders the dog call name in quotes when provided', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    // Call name is wrapped in curly double-quotes — match the quoted form so
    // the assertion targets the call-name line specifically.
    expect(screen.getByText(/“Cooper”/)).toBeInTheDocument();
  });

  it('omits the call-name line when null', () => {
    const { container } = render(<BannerEntryReceived {...BASE_PROPS} dogCallName={null} />);
    expect(container.textContent).not.toContain('“Cooper”');
  });

  it('renders the class summary', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Excellent Containers/)).toBeInTheDocument();
  });

  it('renders the formatted total', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeInTheDocument();
  });

  it('disables the "Print my entry blank" button when onPrintEntryBlank is undefined', () => {
    render(<BannerEntryReceived {...BASE_PROPS} onPrintEntryBlank={undefined} />);
    expect(screen.getByRole('button', { name: /print my entry blank/i })).toBeDisabled();
  });

  it('invokes onPrintEntryBlank when the print button is clicked', async () => {
    const onPrint = vi.fn();
    const user = userEvent.setup();
    render(<BannerEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    await user.click(screen.getByRole('button', { name: /print my entry blank/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('navigates home on "Return to dashboard"', async () => {
    const user = userEvent.setup();
    render(<BannerEntryReceived {...BASE_PROPS} />);
    await user.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows the confirmation-date caption when supplied', () => {
    render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Jun 6, 2026/)).toBeInTheDocument();
  });

  it('honors a custom brandColor on the masthead', () => {
    const { container } = render(<BannerEntryReceived {...BASE_PROPS} brandColor="#7a1f1f" />);
    const masthead = container.querySelector('header') as HTMLElement | null;
    expect(masthead?.style.background).toBe('rgb(122, 31, 31)');
  });

  it('falls back to default deep teal when brandColor is null', () => {
    const { container } = render(<BannerEntryReceived {...BASE_PROPS} brandColor={null} />);
    const masthead = container.querySelector('header') as HTMLElement | null;
    expect(masthead?.style.background).toBe('rgb(13, 77, 79)');
  });

  it('scopes its styles under [data-banner]', () => {
    const { container } = render(<BannerEntryReceived {...BASE_PROPS} />);
    expect(container.querySelector('[data-banner]')).not.toBeNull();
  });
});
