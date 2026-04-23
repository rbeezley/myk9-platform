import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PageDirectoryRow } from '../components/PageDirectoryRow';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

const entry: PageEntry = {
  path: '/shows/:id',
  title: 'Show Details',
  description: 'Per-show view.',
  roles: [UserRole.EXHIBITOR, UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Shows',
  status: 'working',
};

describe('PageDirectoryRow', () => {
  it('renders title, description, path, category, and status', () => {
    render(<PageDirectoryRow entry={entry} resolvedPath="/shows/SHOW_1" loading={false} />);
    expect(screen.getByText('Show Details')).toBeInTheDocument();
    expect(screen.getByText('Per-show view.')).toBeInTheDocument();
    expect(screen.getByText('/shows/:id')).toBeInTheDocument();
    expect(screen.getByText(/Shows/)).toBeInTheDocument();
    expect(screen.getByText(/working/)).toBeInTheDocument();
  });

  it('renders an enabled "Go to page" link when resolvedPath is present', () => {
    render(<PageDirectoryRow entry={entry} resolvedPath="/shows/SHOW_1" loading={false} />);
    const link = screen.getByRole('link', { name: /go to page/i });
    expect(link).toHaveAttribute('href', '/shows/SHOW_1');
  });

  it('disables "Go to page" when loading', () => {
    render(<PageDirectoryRow entry={entry} resolvedPath={null} loading={true} />);
    const btn = screen.getByRole('button', { name: /go to page/i });
    expect(btn).toBeDisabled();
  });

  it('disables "Go to page" with tooltip when resolvedPath is null and not loading', () => {
    render(<PageDirectoryRow entry={entry} resolvedPath={null} loading={false} />);
    const btn = screen.getByRole('button', { name: /go to page/i });
    expect(btn).toBeDisabled();
  });

  it('renders non-parameterized entry with the path as href', () => {
    const flat: PageEntry = { ...entry, path: '/admin/dashboard' };
    render(<PageDirectoryRow entry={flat} resolvedPath="/admin/dashboard" loading={false} />);
    const link = screen.getByRole('link', { name: /go to page/i });
    expect(link).toHaveAttribute('href', '/admin/dashboard');
  });
});
