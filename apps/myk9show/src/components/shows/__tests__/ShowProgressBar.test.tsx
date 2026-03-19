import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowProgressBar } from '../ShowProgressBar';

describe('ShowProgressBar', () => {
  it('renders trial and entry counts', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={0} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/trials/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/entries/)).toBeInTheDocument();
  });

  it('shows scored text when scoredTrials > 0', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={3} />);
    expect(screen.getByText('3/5 scored')).toBeInTheDocument();
  });

  it('does not show scored text when scoredTrials is 0', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={0} />);
    expect(screen.queryByText(/scored/)).not.toBeInTheDocument();
  });

  it('shows green color when all trials scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={5} />
    );
    const scoredText = screen.getByText('5/5 scored');
    expect(scoredText.className).toContain('text-green-500');
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill?.className).toContain('bg-green-500');
  });

  it('shows orange color when partially scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={3} />
    );
    const scoredText = screen.getByText('3/5 scored');
    expect(scoredText.className).toContain('text-orange-500');
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill?.className).toContain('bg-orange-500');
  });

  it('renders empty progress track when 0 scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={0} />
    );
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('renders 100% width when all scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={4} totalEntries={30} scoredTrials={4} />
    );
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('has aria-label when trials are scored', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={3} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', '3 of 5 trials scored');
  });
});
