import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** The flex wrapper that holds one crumb's chevron and label. */
function crumb(label: string): HTMLElement {
  const wrapper = screen.getByTitle(label).parentElement;
  if (!wrapper) throw new Error(`crumb "${label}" has no wrapper`);
  return wrapper;
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
        actions={<button>New Show</button>}
      />
    );
    expect(screen.getByText('New Show')).toBeInTheDocument();
  });

  it('renders without actions', () => {
    renderWithRouter(
      <PageHeader breadcrumbs={[{ label: 'Shows', href: '/shows' }]} title="Shows" />
    );
    expect(screen.getAllByText('Shows').length).toBeGreaterThanOrEqual(1);
  });

  // MYK9-1065: a long show › trial › class trail pushed the class page 96px past
  // a 360px viewport. jsdom has no layout, so the geometry is pinned by the E2E
  // overflow assertion; this pins what a reader of a truncated crumb gets.
  it("lets a long trail truncate, keeping each crumb's full text in its title", () => {
    const show = 'Heartland ASCA Scent Detection Trial';
    const trial = 'ASCA Scent Detection Trial';
    const current = 'Container Novice';
    renderWithRouter(
      <PageHeader
        breadcrumbs={[
          { label: 'Shows', href: '/shows' },
          { label: show, href: '/shows/s1' },
          { label: trial, href: '/trials/t1' },
          { label: current, href: '/classes/c1' },
        ]}
        title={current}
        omitTitle
      />
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveClass('min-w-0');

    const showLink = screen.getByRole('link', { name: show });
    expect(showLink).toHaveAttribute('title', show);
    expect(showLink).toHaveClass('truncate');
    expect(screen.getByRole('link', { name: trial })).toHaveAttribute('title', trial);

    const currentCrumb = screen.getByText(current);
    expect(currentCrumb).toHaveAttribute('title', current);
    expect(currentCrumb).toHaveAttribute('aria-current', 'page');
    expect(currentCrumb).toHaveClass('truncate');
  });

  it('folds every ancestor before the parent into one "…" on phones', () => {
    const { container } = renderWithRouter(
      <PageHeader
        breadcrumbs={[
          { label: 'Shows', href: '/shows' },
          { label: 'Show', href: '/shows/s1' },
          { label: 'Trial', href: '/trials/t1' },
          { label: 'Class', href: '/classes/c1' },
        ]}
        title="Class"
        omitTitle
      />
    );
    expect(crumb('Shows')).toHaveClass('hidden', 'sm:flex');
    expect(crumb('Show')).toHaveClass('hidden', 'sm:flex');
    expect(crumb('Trial')).not.toHaveClass('hidden');
    expect(crumb('Class')).not.toHaveClass('hidden');
    expect(container.querySelectorAll('nav [aria-hidden="true"].sm\\:hidden')).toHaveLength(1);
  });

  it('folds nothing when the trail is only a parent and the current page', () => {
    const { container } = renderWithRouter(
      <PageHeader
        breadcrumbs={[
          { label: 'Shows', href: '/shows' },
          { label: 'Show', href: '/shows/s1' },
        ]}
        title="Show"
        omitTitle
      />
    );
    expect(crumb('Shows')).not.toHaveClass('hidden');
    expect(container.querySelector('nav [aria-hidden="true"].sm\\:hidden')).toBeNull();
  });
});
