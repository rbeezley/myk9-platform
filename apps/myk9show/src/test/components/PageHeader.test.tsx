import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PageHeader', () => {
  it('renders breadcrumb items', () => {
    renderWithRouter(
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Shows', href: '/shows' },
        ]}
        title="Shows"
      />
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    // "Shows" appears in both the sr-only h1 and the breadcrumb
    expect(screen.getAllByText('Shows')).toHaveLength(2);
  });

  it('renders sr-only title for accessibility', () => {
    renderWithRouter(
      <PageHeader breadcrumbs={[{ label: 'Shows', href: '/shows' }]} title="Shows" />
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveClass('sr-only');
    expect(title).toHaveTextContent('Shows');
  });

  it('renders action buttons when provided', () => {
    renderWithRouter(
      <PageHeader
        breadcrumbs={[{ label: 'Shows', href: '/shows' }]}
        title="Shows"
        actions={<button>Create Show</button>}
      />
    );
    expect(screen.getByText('Create Show')).toBeInTheDocument();
  });

  it('renders without actions', () => {
    renderWithRouter(
      <PageHeader breadcrumbs={[{ label: 'Shows', href: '/shows' }]} title="Shows" />
    );
    expect(screen.getAllByText('Shows').length).toBeGreaterThanOrEqual(1);
  });
});
