import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalPlaceholderPage from '@/pages/LegalPlaceholderPage';

describe('LegalPlaceholderPage', () => {
  it('renders Terms of Service title', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Terms of Service" />
      </MemoryRouter>
    );
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  it('renders Privacy Policy title', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Privacy Policy" />
      </MemoryRouter>
    );
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('renders placeholder message', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Terms of Service" />
      </MemoryRouter>
    );
    expect(
      screen.getByText('This page is under construction. Please check back soon.')
    ).toBeInTheDocument();
  });

  it('renders a link back to the home page', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Terms of Service" />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /myk9show/i })).toHaveAttribute('href', '/');
  });
});
