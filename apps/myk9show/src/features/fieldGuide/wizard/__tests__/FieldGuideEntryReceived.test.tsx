import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { FieldGuideEntryReceived } from '../FieldGuideEntryReceived';

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
  classSummary: '3 runs · Excellent Containers · Judge C. Beagles',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: 'Jun 6, 2026',
};

describe('FieldGuideEntryReceived', () => {
  it('renders the ready-to-submit heading', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /entry ready to submit/i })).toBeTruthy();
  });

  it('renders the byline with show, club, and date range', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getByText(/Spring Scent Work Trial · Bexar County Kennel Club · 12–14 June 2026/)
    ).toBeInTheDocument();
  });

  it('shows the entry number in both the top strip and a chip', () => {
    const { container } = render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(container.textContent).toContain('ENTRY 2026-0137');
  });

  it('omits the entry strip + chip when registrationNumber is null', () => {
    const { container } = render(
      <FieldGuideEntryReceived {...BASE_PROPS} registrationNumber={null} />
    );
    expect(container.textContent).not.toContain('ENTRY');
  });

  it('renders the ready-to-submit orange chip in the header', () => {
    const { container } = render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    const chip = container.querySelector('[data-variant="orange"]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe('READY TO SUBMIT');
  });

  it('derives a "3 RUNS" chip from the leading run-count in classSummary', () => {
    const { container } = render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    const chips = Array.from(container.querySelectorAll('[data-variant]'));
    const labels = chips.map(c => c.textContent);
    expect(labels).toContain('3 RUNS');
  });

  it('singularizes the runs chip when only one run', () => {
    const { container } = render(
      <FieldGuideEntryReceived
        {...BASE_PROPS}
        classSummary="1 run · Excellent Containers · Judge C. Beagles"
      />
    );
    const labels = Array.from(container.querySelectorAll('[data-variant]')).map(c => c.textContent);
    expect(labels).toContain('1 RUN');
    expect(labels).not.toContain('1 RUNS');
  });

  it('omits the runs chip when classSummary does not begin with a count', () => {
    const { container } = render(
      <FieldGuideEntryReceived
        {...BASE_PROPS}
        classSummary="Excellent Containers · Judge C. Beagles"
      />
    );
    const labels = Array.from(container.querySelectorAll('[data-variant]')).map(c => c.textContent);
    expect(labels.find(l => l && /RUN(S)?$/.test(l))).toBeUndefined();
  });

  it('renders the dog registered name', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(
      screen.getByText("GCh. Ridgeway's Wandering Trailblazer, CGC")
    ).toBeInTheDocument();
  });

  it('renders the dog call name in curly quotes when supplied', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/“Cooper”/)).toBeInTheDocument();
  });

  it('omits the call-name line when null', () => {
    const { container } = render(
      <FieldGuideEntryReceived {...BASE_PROPS} dogCallName={null} />
    );
    expect(container.textContent).not.toContain('“Cooper”');
  });

  it('renders the formatted total in mono tabular nums', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeInTheDocument();
  });

  it('disables the print button when onPrintEntryBlank is undefined', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} onPrintEntryBlank={undefined} />);
    expect(screen.getByRole('button', { name: /print my entry blank/i })).toBeDisabled();
  });

  it('invokes onPrintEntryBlank when the print button is clicked', async () => {
    const onPrint = vi.fn();
    const user = userEvent.setup();
    render(<FieldGuideEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    await user.click(screen.getByRole('button', { name: /print my entry blank/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('navigates home on "Return to dashboard"', async () => {
    const user = userEvent.setup();
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    await user.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows the confirmation-date caption when supplied', () => {
    render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Jun 6, 2026/)).toBeInTheDocument();
  });

  it('scopes its styles under [data-field-guide]', () => {
    const { container } = render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(container.querySelector('[data-field-guide]')).not.toBeNull();
  });

  it('emits zero font-style: italic declarations (Field Guide discipline)', () => {
    const { container } = render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
  });

  it('uses no display-serif font families anywhere on the wizard surface', () => {
    const { container } = render(<FieldGuideEntryReceived {...BASE_PROPS} />);
    // The wizard surface has no welcome prose, so the only allowed serif
    // (IBM Plex Serif) must NOT appear here.
    expect(container.innerHTML).not.toContain('IBM Plex Serif');
    expect(container.innerHTML).not.toContain('Cormorant Garamond');
    expect(container.innerHTML).not.toContain('Playfair');
    expect(container.innerHTML).not.toContain('Bodoni');
    expect(container.innerHTML).not.toContain('EB Garamond');
  });
});
