import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VenueMap } from '@/components/shows/overview/VenueMap';

describe('VenueMap', () => {
  it('renders map iframe with encoded address', () => {
    render(<VenueMap location="Johnson County Fairgrounds, Olathe, KS" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toContain('maps.google.com');
    expect(iframe?.src).toContain('Johnson');
  });

  it('renders venue address text', () => {
    render(<VenueMap location="Johnson County Fairgrounds, Olathe, KS" />);
    expect(screen.getByText('Johnson County Fairgrounds, Olathe, KS')).toBeInTheDocument();
  });

  it('renders Get Directions link with correct href', () => {
    render(<VenueMap location="Olathe, KS" />);
    const link = screen.getByRole('link', { name: /get directions/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps/dir'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('iframe has accessible title', () => {
    render(<VenueMap location="Olathe, KS" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toHaveAttribute('title', expect.stringContaining('Map'));
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
