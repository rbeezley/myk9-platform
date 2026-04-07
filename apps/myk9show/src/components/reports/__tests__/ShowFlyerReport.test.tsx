import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowFlyerReport } from '../ShowFlyerReport';

// A real UUID whose generated exhibitor passcode we can check is rendered
const SHOW_ID = '550e8400-e29b-41d4-a716-446655440000';

const baseProps = {
  showId: SHOW_ID,
  showName: 'Spring Scent Trial 2026',
  clubName: 'Bay Area Nose Work Club',
  showDates: '2026-04-12 – 2026-04-13',
  entries: [],
  sortOrder: '',
};

describe('ShowFlyerReport', () => {
  it('renders the show name on page 1', () => {
    render(<ShowFlyerReport {...baseProps} />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
  });

  it('renders the club name', () => {
    render(<ShowFlyerReport {...baseProps} />);
    expect(screen.getByText(/Bay Area Nose Work Club/)).toBeInTheDocument();
  });

  it('renders the show dates', () => {
    render(<ShowFlyerReport {...baseProps} />);
    expect(screen.getByText(/2026-04-12/)).toBeInTheDocument();
  });

  it('renders the myK9Show brand on both pages', () => {
    render(<ShowFlyerReport {...baseProps} />);
    const brandEls = screen.getAllByText('myK9Show');
    expect(brandEls.length).toBeGreaterThanOrEqual(2);
  });

  it('renders an exhibitor passcode', () => {
    render(<ShowFlyerReport {...baseProps} />);
    // The passcode label appears at least once (also referenced in page 2 guide text)
    const labels = screen.getAllByText('Exhibitor Passcode');
    expect(labels.length).toBeGreaterThan(0);
    // A non-empty passcode value is rendered inside .flyer-passcode-value
    const el = document.querySelector('.flyer-passcode-value');
    expect(el?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders the getting-started guide on page 2', () => {
    render(<ShowFlyerReport {...baseProps} />);
    expect(screen.getByText('Getting Started with myK9Q')).toBeInTheDocument();
  });

  it('renders app.myk9q.com reference', () => {
    render(<ShowFlyerReport {...baseProps} />);
    expect(screen.getAllByText(/app\.myk9q\.com/).length).toBeGreaterThan(0);
  });

  it('shows an error state when showId is missing', () => {
    const props = { ...baseProps, showId: undefined };
    render(<ShowFlyerReport {...props} />);
    expect(screen.getByText(/Show ID is required/)).toBeInTheDocument();
  });

  it('renders without optional clubName and showDates', () => {
    const props = { ...baseProps, clubName: undefined, showDates: undefined };
    render(<ShowFlyerReport {...props} />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
  });
});
