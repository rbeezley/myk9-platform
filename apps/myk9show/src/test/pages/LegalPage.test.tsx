import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalPage from '@/pages/LegalPage';

describe('LegalPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading spinner initially', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <LegalPage title="Terms of Service" markdownPath="/legal/terms-of-service.md" />
      </MemoryRouter>
    );

    expect(screen.getByText(/back to myk9show/i)).toBeInTheDocument();
  });

  it('renders markdown content after loading', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        '# Terms of Service\n\nThis is the terms content.\n\n## Section One\n\nSome details here.',
    } as Response);

    render(
      <MemoryRouter>
        <LegalPage title="Terms of Service" markdownPath="/legal/terms-of-service.md" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Terms of Service')).toBeInTheDocument();
    });

    expect(screen.getByText('This is the terms content.')).toBeInTheDocument();
    expect(screen.getByText('Section One')).toBeInTheDocument();
  });

  it('renders Privacy Policy content', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Privacy Policy\n\nWe respect your privacy.',
    } as Response);

    render(
      <MemoryRouter>
        <LegalPage title="Privacy Policy" markdownPath="/legal/privacy-policy.md" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });

    expect(screen.getByText('We respect your privacy.')).toBeInTheDocument();
  });

  it('renders a back link to the home page', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Terms\n\nContent.',
    } as Response);

    render(
      <MemoryRouter>
        <LegalPage title="Terms of Service" markdownPath="/legal/terms-of-service.md" />
      </MemoryRouter>
    );

    const backLink = screen.getByText(/back to myk9show/i);
    expect(backLink.closest('a')).toHaveAttribute('href', '/');
  });

  it('shows error message when fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    render(
      <MemoryRouter>
        <LegalPage title="Terms of Service" markdownPath="/legal/terms-of-service.md" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load terms of service/i)).toBeInTheDocument();
    });
  });

  it('fetches the correct markdown path', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Test',
    } as Response);

    render(
      <MemoryRouter>
        <LegalPage title="Privacy Policy" markdownPath="/legal/privacy-policy.md" />
      </MemoryRouter>
    );

    expect(fetchSpy).toHaveBeenCalledWith('/legal/privacy-policy.md');
  });

  it('converts markdown bold and links to HTML', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Title\n\nThis has **bold text** and a [link](https://example.com).',
    } as Response);

    const { container } = render(
      <MemoryRouter>
        <LegalPage title="Terms" markdownPath="/legal/terms.md" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    expect(container.querySelector('strong')).toHaveTextContent('bold text');
    expect(container.querySelector('a[href="https://example.com"]')).toHaveTextContent('link');
  });

  it('converts markdown lists to HTML', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '# Title\n\n- Item one\n- Item two\n- Item three',
    } as Response);

    const { container } = render(
      <MemoryRouter>
        <LegalPage title="Terms" markdownPath="/legal/terms.md" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(3);
    expect(listItems[0]).toHaveTextContent('Item one');
  });
});
