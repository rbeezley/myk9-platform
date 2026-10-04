import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ExhibitorFeatures } from './ExhibitorFeatures';

describe('ExhibitorFeatures — free waitlists (MYK9-1013)', () => {
  it('sells free waitlists as an exhibitor feature', () => {
    render(<ExhibitorFeatures />);
    expect(screen.getByRole('heading', { name: /free waitlists/i })).toHaveTextContent(
      'Free waitlists. Pay only for a spot.'
    );
    expect(
      screen.getByText('Other sites charge you just to wait; we only charge when you get a spot.')
    ).toBeInTheDocument();
  });
});
