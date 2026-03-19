import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DateCircle } from '../DateCircle';

describe('DateCircle', () => {
  it('renders month abbreviation and day number', () => {
    render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    expect(screen.getByText('MAY')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows days badge for multi-day events', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-10" status="upcoming" />);
    expect(screen.getByText('2 days')).toBeInTheDocument();
  });

  it('hides days badge for single-day events', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-09" status="upcoming" />);
    expect(screen.queryByText(/day/)).not.toBeInTheDocument();
  });

  it('hides days badge when endDate is not provided', () => {
    render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    expect(screen.queryByText(/day/)).not.toBeInTheDocument();
  });

  it('applies green border for accepting status', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="accepting" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('border-green-500');
  });

  it('applies orange border for closing_soon status', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="closing_soon" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('border-orange-500');
  });

  it('applies blue border for in_progress status', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="in_progress" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('border-blue-500');
  });

  it('has accessible aria-label for multi-day show', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-11" status="upcoming" />);
    expect(screen.getByLabelText('May 9, 3 day show')).toBeInTheDocument();
  });

  it('has accessible aria-label for single-day show', () => {
    render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    expect(screen.getByLabelText('May 9')).toBeInTheDocument();
  });

  it('renders sm size by default (56px)', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('w-14'); // 56px = w-14
  });

  it('renders md size when specified (60px)', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="upcoming" size="md" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('w-[60px]');
  });

  it('hides days badge when endDate equals startDate', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-09" status="upcoming" />);
    expect(screen.queryByText(/day/)).not.toBeInTheDocument();
  });
});
