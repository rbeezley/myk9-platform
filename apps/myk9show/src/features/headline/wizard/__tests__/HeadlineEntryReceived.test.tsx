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

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  classSummary: 'Excellent · Containers, Interiors, Buried',
  totalFeesFormatted: '$69.00',
  registrationNumber: 'BCKC-2026-0427',
  confirmationDateLabel: '6 June 2026',
};

describe('HeadlineEntryReceived', () => {
  it('renders the Headline completion heading', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /ready to submit/i })).toBeTruthy();
  });

  it('displays club, show, dog, classes, fees, and receipt number', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);

    expect(screen.getByText('Bexar County Kennel Club')).toBeTruthy();
    expect(screen.getByText('Spring Scent Work Trial')).toBeTruthy();
    expect(screen.getByText("GCh. Ridgeway's Wandering Cooper, CGC")).toBeTruthy();
    expect(screen.getByText(/Excellent · Containers/)).toBeTruthy();
    expect(screen.getByText('$69.00')).toBeTruthy();
    expect(screen.getByText(/BCKC-2026-0427/)).toBeTruthy();
  });

  it('shows the confirmation date caption when present', () => {
    render(<HeadlineEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/6 June 2026/)).toBeTruthy();
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

  it('renders without optional call name and confirmation date', () => {
    render(
      <HeadlineEntryReceived {...BASE_PROPS} dogCallName={null} confirmationDateLabel={null} />
    );

    expect(screen.getByRole('heading', { name: /ready to submit/i })).toBeTruthy();
    expect(screen.queryByText(/Watch your inbox/i)).toBeNull();
  });
});
