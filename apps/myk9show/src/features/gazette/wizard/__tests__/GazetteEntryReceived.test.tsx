import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { GazetteEntryReceived } from '../GazetteEntryReceived';

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

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: 'Jun 12–14, 2026',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  classSummary: '3 runs · Excellent · Containers, Interiors, Buried',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: 'Jun 6, 2026',
};

describe('GazetteEntryReceived', () => {
  it('renders the "Your entry is received" heading', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByRole('heading', { name: /received/i })).toBeTruthy();
  });

  it('renders the club name in the mini-masthead (auto-italic split)', () => {
    const { container } = render(<GazetteEntryReceived {...BASE_PROPS} />);
    // The masthead primitive splits "Bexar County Kennel Club" into:
    //   <em>Bexar</em> County Kennel <em>Club</em>
    // so the whole string is broken up in the DOM but joined in textContent.
    expect(container.textContent).toContain('Bexar County Kennel Club');
  });

  it('renders the show name and date range in the byline', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Spring Scent Work Trial · Jun 12–14, 2026/)).toBeTruthy();
  });

  it('renders the dog registered name + call name', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText("GCh. Ridgeway's Wandering Cooper, CGC")).toBeTruthy();
    // Call name renders inside curly quotes — match the exact wrapped form.
    expect(screen.getByText(/[“"]Cooper[”"]/)).toBeTruthy();
  });

  it('renders the class summary', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(BASE_PROPS.classSummary)).toBeTruthy();
  });

  it('renders the total fees prominently', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText('$69.00')).toBeTruthy();
  });

  it('renders the receipt number label when supplied', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Receipt № 2026-0137/)).toBeTruthy();
  });

  it('falls back to "Total fees" label when no registration number', () => {
    render(
      <GazetteEntryReceived {...BASE_PROPS} registrationNumber={null} />
    );
    expect(screen.getByText(/Total fees/i)).toBeTruthy();
  });

  it('renders the confirmation date caption when supplied', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    expect(screen.getByText(/Jun 6, 2026/)).toBeTruthy();
  });

  it('omits the confirmation caption when null', () => {
    const { container } = render(
      <GazetteEntryReceived {...BASE_PROPS} confirmationDateLabel={null} />
    );
    expect(container.textContent).not.toMatch(/A formal confirmation will be emailed/);
  });

  it('disables the print button when no handler is supplied', () => {
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    expect(btn).toBeDisabled();
  });

  it('invokes onPrintEntryBlank when print button clicked', async () => {
    const onPrint = vi.fn();
    render(<GazetteEntryReceived {...BASE_PROPS} onPrintEntryBlank={onPrint} />);
    const btn = screen.getByRole('button', { name: /print my entry blank/i });
    await userEvent.click(btn);
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it('navigates home on "Return to dashboard" click', async () => {
    mockNavigate.mockClear();
    render(<GazetteEntryReceived {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('attaches the data-gazette attribute on the root for scoped CSS', () => {
    const { container } = render(<GazetteEntryReceived {...BASE_PROPS} />);
    const root = container.querySelector('[data-gazette]');
    expect(root).toBeInTheDocument();
  });
});
