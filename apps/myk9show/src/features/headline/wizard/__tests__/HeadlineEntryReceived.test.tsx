import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { HeadlineEntryReceived } from '../HeadlineEntryReceived';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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

describe('HeadlineEntryReceived', () => {
  it('renders the Headline completion heading', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /entry submitted/i })).toBeTruthy();
  });

  it('displays club, show, dog, classes, fees, and confirmation number', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);

    expect(screen.getByText('Bexar County Kennel Club')).toBeTruthy();
    expect(screen.getByText('Spring Scent Work Trial')).toBeTruthy();
    expect(screen.getByText("GCh. Ridgeway's Wandering Cooper, CGC")).toBeTruthy();
    expect(screen.getByText(/Excellent · Containers/)).toBeTruthy();
    expect(screen.getByText('$69.00')).toBeTruthy();
    const confirmationLabel = screen.getByText(/Confirmation number MK9-000427/);
    expect(confirmationLabel).toBeTruthy();
    expect(confirmationLabel).not.toHaveStyle('text-transform: uppercase');
    expect(screen.queryByText(/Entry #/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Registration #/)).not.toBeInTheDocument();
  });

  it('shows the confirmation date caption when present', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/we will email you a full confirmation/)).toBeTruthy();
    expect(screen.getByText(/Watch your inbox/i)).toBeTruthy();
  });

  it('disables print when no print handler is provided', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onPrintEntryBlank when the print button is clicked', async () => {
    const onPrint = vi.fn();
    render(<HeadlineEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);

    await userEvent.click(screen.getByRole('button', { name: /print my entry blank/i }));
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it('navigates to the dashboard', async () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);

    await userEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders without the optional call name', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} dogs={[{ ...DOG, callName: null }]} />);

    expect(screen.getByRole('heading', { name: /entry submitted/i })).toBeTruthy();
  });
});
