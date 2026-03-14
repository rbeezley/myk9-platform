import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HowItWorks from '../HowItWorks';

describe('HowItWorks', () => {
  it('renders all four steps', () => {
    render(<HowItWorks />);

    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Compete')).toBeInTheDocument();
    expect(screen.getByText('Track')).toBeInTheDocument();
  });

  it('renders step descriptions', () => {
    render(<HowItWorks />);

    expect(screen.getByText(/Find shows by date/)).toBeInTheDocument();
    expect(screen.getByText(/Register your dogs/)).toBeInTheDocument();
    expect(screen.getByText(/Live scoring/)).toBeInTheDocument();
    expect(screen.getByText(/Titles, health records/)).toBeInTheDocument();
  });

  it('uses semantic ol for accessibility', () => {
    const { container } = render(<HowItWorks />);
    const list = container.querySelector('ol');
    expect(list).toBeInTheDocument();
    expect(list?.querySelectorAll('li')).toHaveLength(4);
  });
});
