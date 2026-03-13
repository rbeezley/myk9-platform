import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';

describe('EmailStatusIcon', () => {
  it('renders nothing when status is undefined', () => {
    const { container } = render(<EmailStatusIcon status={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders green checkmark for delivered', () => {
    render(<EmailStatusIcon status="delivered" />);
    expect(screen.getByTitle('Email delivered')).toBeInTheDocument();
  });

  it('renders yellow clock for sent', () => {
    render(<EmailStatusIcon status="sent" />);
    expect(screen.getByTitle('Email sent, awaiting delivery')).toBeInTheDocument();
  });

  it('renders red warning for bounced', () => {
    render(<EmailStatusIcon status="bounced" />);
    expect(screen.getByTitle(/bounced/i)).toBeInTheDocument();
  });

  it('renders red warning for failed with error tooltip', () => {
    render(<EmailStatusIcon status="failed" errorMessage="Invalid address" />);
    expect(screen.getByTitle(/failed.*invalid address/i)).toBeInTheDocument();
  });
});
