import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { MonogramEntryReceived } from '../MonogramEntryReceived';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogRegisteredName: "CH Cedarwood's Risen On Pointe RN",
  dogCallName: 'Pointe',
  classSummary: '3 runs · Excellent Containers, Excellent Interiors · Judge Mrs. Beagles',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: 'Jun 6, 2026',
};

describe('MonogramEntryReceived', () => {
  it('renders the ready heading', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /ready/i })).toBeTruthy();
  });

  it('displays the club name', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('Bexar County Kennel Club')).toBeInTheDocument();
  });

  it('displays show name and date range as the byline', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Spring Scent Work Trial · 12–14 June 2026/)).toBeInTheDocument();
  });

  it('renders the dog registered name', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText("CH Cedarwood's Risen On Pointe RN")).toBeInTheDocument();
  });

  it('renders the dog call name in quotes when provided', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/called.+Pointe/)).toBeInTheDocument();
  });

  it('omits the call-name line when null', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} dogCallName={null} />);
    expect(screen.queryByText(/called/)).toBeNull();
  });

  it('renders the class summary line', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Excellent Containers/)).toBeInTheDocument();
  });

  it('renders the entry number with № glyph when registrationNumber is supplied', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Entry № 2026-0137/)).toBeInTheDocument();
  });

  it('falls back to "Fees due" label when no registration number', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} registrationNumber={null} />);
    expect(screen.getByText('Fees due')).toBeInTheDocument();
  });

  it('renders the total fees amount', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeInTheDocument();
  });

  it('disables the "Print my entry blank" button when no handler is supplied', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} onPrintEntryBlank={undefined} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    expect(btn).toBeDisabled();
  });

  it('invokes onPrintEntryBlank when the print button is clicked', async () => {
    const onPrint = vi.fn();
    const user = userEvent.setup();
    render(<MonogramEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    await user.click(screen.getByRole('button', { name: /print my entry blank/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('navigates home when "Return to dashboard" is clicked', async () => {
    const user = userEvent.setup();
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    await user.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows the confirmation-date caption when supplied', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Jun 6, 2026/)).toBeInTheDocument();
  });

  it('omits the confirmation caption when confirmationDateLabel is null', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} confirmationDateLabel={null} />);
    expect(screen.queryByText(/once the draw is complete/)).toBeNull();
  });

  it('derives initials from the club name when monogramLetters is not supplied', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} />);
    // Bexar County Kennel Club → "BCK"
    expect(screen.getByText('BCK')).toBeInTheDocument();
  });

  it('honors an explicit monogramLetters override', () => {
    render(<MonogramEntryReceived {...BASE_PROPS} monogramLetters="X" />);
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('scopes its styles under [data-monogram]', () => {
    const { container } = render(<MonogramEntryReceived {...BASE_PROPS} />);
    expect(container.querySelector('[data-monogram]')).not.toBeNull();
  });
});
