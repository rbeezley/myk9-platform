import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DetailHero } from '../DetailHero';
import { PageHeader } from '../PageHeader';

describe('DetailHero as the one detail-page header (MYK9-930)', () => {
  it('renders the parent as a link to its own page, in the subtitle slot', () => {
    render(
      <DetailHero name="Spring Classic" parent={{ label: 'Bergen KC', href: '/clubs/c-1' }} />
    );
    expect(screen.getByRole('link', { name: 'Bergen KC' })).toHaveAttribute('href', '/clubs/c-1');
  });

  it('renders a subtitle beside the parent link when both are given', () => {
    render(
      <DetailHero
        name="Trial 1"
        subtitle="Saturday"
        parent={{ label: 'Spring Classic', href: '/shows/s-1' }}
      />
    );
    expect(screen.getByRole('link', { name: 'Spring Classic' })).toBeInTheDocument();
    expect(screen.getByText('Saturday')).toBeInTheDocument();
  });

  it('renders no parent link when none is given', () => {
    render(<DetailHero name="Spring Classic" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('can own the page h1, so the visible title is the real heading', () => {
    render(<DetailHero name="Spring Classic" headingLevel={1} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Spring Classic' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('keeps the h2 default for existing callers', () => {
    render(<DetailHero name="Spring Classic" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Spring Classic' })).toBeInTheDocument();
  });

  it('makes the heading a focus target when given a ref', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<DetailHero name="Maple" headingLevel={1} headingRef={ref} />);
    expect(ref.current).toBe(screen.getByRole('heading', { name: 'Maple' }));
    expect(ref.current).toHaveAttribute('tabindex', '-1');
  });

  it('renders the banner above the card body and details under the facts row', () => {
    render(
      <DetailHero
        name="Heartland"
        banner={<div data-testid="hero-banner" />}
        details={<p data-testid="hero-details">Pending authorization</p>}
        metadata={[{ label: 'Tulsa, OK' }]}
      />
    );
    const banner = screen.getByTestId('hero-banner');
    const title = screen.getByRole('heading', { name: 'Heartland' });
    const facts = screen.getByText('Tulsa, OK');
    const details = screen.getByTestId('hero-details');
    expect(banner.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(facts.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lets a narrow cover (a club logo) replace the 200px date-block width', () => {
    const { container } = render(
      <DetailHero name="Heartland" cover={<span>logo</span>} coverClassName="w-16" />
    );
    expect(container.querySelector('[class*="w-\\[200px\\]"]')).toBeNull();
    expect(screen.getByText('logo').parentElement).toHaveClass('w-16');
  });
});

describe('PageHeader when the hero owns the title (MYK9-930)', () => {
  it('renders no second h1', () => {
    const { container } = render(
      <>
        <PageHeader
          breadcrumbs={[{ label: 'Clubs', href: '/clubs' }]}
          title="Heartland"
          omitTitle
        />
        <DetailHero name="Heartland" headingLevel={1} />
      </>
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('h1.sr-only')).toBeNull();
  });

  it('still renders the sr-only h1 by default', () => {
    render(<PageHeader breadcrumbs={[{ label: 'Clubs', href: '/clubs' }]} title="Heartland" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
  });
});
