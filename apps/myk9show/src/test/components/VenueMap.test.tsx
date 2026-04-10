import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { VenueMap } from '@/components/shows/overview/VenueMap';

describe('VenueMap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it('renders View on Google Maps link that works even if embed fails', () => {
    render(<VenueMap location="Olathe, KS" />);
    const link = screen.getByRole('link', { name: /view on google maps/i });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Olathe%2C%20KS'
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('falls back to keyless embed when no API key is configured', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_EMBED_API_KEY', '');
    render(<VenueMap location="Olathe, KS" />);
    const iframe = document.querySelector('iframe');
    expect(iframe?.src).toContain('maps.google.com/maps?q=');
    expect(iframe?.src).not.toContain('maps/embed/v1/place');
  });

  it('uses documented Embed API when VITE_GOOGLE_MAPS_EMBED_API_KEY is set', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_EMBED_API_KEY', 'test-key-123');
    render(<VenueMap location="Olathe, KS" />);
    const iframe = document.querySelector('iframe');
    expect(iframe?.src).toContain('https://www.google.com/maps/embed/v1/place');
    expect(iframe?.src).toContain('key=test-key-123');
    expect(iframe?.src).toContain('q=Olathe%2C%20KS');
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
