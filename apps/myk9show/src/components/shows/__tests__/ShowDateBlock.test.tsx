import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowDateBlock } from '../ShowDateBlock';

describe('ShowDateBlock', () => {
  it('renders the month abbreviation', () => {
    render(<ShowDateBlock startDate="2026-04-26" endDate="2026-04-27" />);
    expect(screen.getByText('Apr')).toBeInTheDocument();
  });

  it('renders a single day number for a one-day show', () => {
    render(<ShowDateBlock startDate="2026-04-26" endDate="2026-04-26" />);
    expect(screen.getByText('26')).toBeInTheDocument();
  });

  it('renders a day range for a multi-day show in the same month', () => {
    render(<ShowDateBlock startDate="2026-04-26" endDate="2026-04-27" />);
    expect(screen.getByText('26–27')).toBeInTheDocument();
  });

  it('renders a single day when endDate is omitted', () => {
    render(<ShowDateBlock startDate="2026-06-15" />);
    expect(screen.getByText('Jun')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders the correct month for January', () => {
    render(<ShowDateBlock startDate="2027-01-03" endDate="2027-01-04" />);
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('renders the correct month for December', () => {
    render(<ShowDateBlock startDate="2026-12-20" endDate="2026-12-21" />);
    expect(screen.getByText('Dec')).toBeInTheDocument();
  });

  it('handles full ISO timestamp strings from the database', () => {
    render(
      <ShowDateBlock startDate="2026-05-09T05:00:00+00:00" endDate="2026-05-10T05:00:00+00:00" />
    );
    expect(screen.getByText('May')).toBeInTheDocument();
    expect(screen.getByText('9–10')).toBeInTheDocument();
  });
});
