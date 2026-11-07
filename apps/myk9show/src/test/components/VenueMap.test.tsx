import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VenueMap } from '@/components/shows/overview/VenueMap';

describe('VenueMap', () => {
  it('renders the venue card with location and name, never an iframe', () => {
    render(<VenueMap location="Olathe, KS" venueName="Johnson County Fairgrounds" />);
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('venue-map-fallback')).toBeInTheDocument();
    expect(screen.getByText('Olathe, KS')).toBeInTheDocument();
    expect(screen.getByText('Johnson County Fairgrounds')).toBeInTheDocument();
  });

  it('renders Get Directions link with the keyless directions URL', () => {
    render(<VenueMap location="Olathe, KS" />);
    const link = screen.getByRole('link', { name: /get directions/i });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Olathe%2C%20KS'
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders View on Google Maps link with the keyless search URL', () => {
    render(<VenueMap location="Olathe, KS" />);
    const link = screen.getByRole('link', { name: /view on google maps/i });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Olathe%2C%20KS'
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('returns null when no location provided', () => {
    const { container } = render(<VenueMap />);
    expect(container.firstElementChild).toBeNull();
  });

  it('returns null for empty location string', () => {
    const { container } = render(<VenueMap location="" />);
    expect(container.firstElementChild).toBeNull();
  });
});
