import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DetailHero } from '../DetailHero';

describe('DetailHero', () => {
  it('renders the entity name', () => {
    render(<DetailHero name="Lehigh Valley Scent Work" />);
    expect(screen.getByRole('heading', { name: /lehigh valley scent work/i })).toBeInTheDocument();
  });

  it('renders eyebrow text when provided', () => {
    render(<DetailHero name="Test Show" eyebrow="Apr 26–27, 2026" />);
    expect(screen.getByText('Apr 26–27, 2026')).toBeInTheDocument();
  });

  it('does not render eyebrow element when omitted', () => {
    render(<DetailHero name="Test Show" />);
    expect(screen.queryByText(/apr/i)).not.toBeInTheDocument();
  });

  it('renders cover slot content when provided', () => {
    render(
      <DetailHero name="Test Show" cover={<div data-testid="show-cover">cover content</div>} />
    );
    expect(screen.getByTestId('show-cover')).toBeInTheDocument();
  });

  it('does not render cover wrapper when cover is omitted', () => {
    const { container } = render(<DetailHero name="Test Show" />);
    // No 200px-wide cover container should be present
    const coverSlot = container.querySelector('[class*="w-\\[200px\\]"]');
    expect(coverSlot).toBeNull();
  });

  it('renders subtitle when provided', () => {
    render(<DetailHero name="Test Show" subtitle="Bergen KC" />);
    expect(screen.getByText('Bergen KC')).toBeInTheDocument();
  });

  it('renders badges', () => {
    render(<DetailHero name="Test Show" badges={[{ label: 'Accepting', variant: 'success' }]} />);
    expect(screen.getByText('Accepting')).toBeInTheDocument();
  });

  it('styles success/warning badges with AA-tuned semantic tokens (not raw green/orange)', () => {
    render(
      <DetailHero
        name="Test Show"
        badges={[
          { label: 'Accepting', variant: 'success' },
          { label: 'Closing soon', variant: 'warning' },
        ]}
      />
    );
    expect(screen.getByText('Accepting').className).toContain('text-success');
    expect(screen.getByText('Closing soon').className).toContain('text-warning');
    // guard against regressing to the raw Tailwind palette
    expect(screen.getByText('Accepting').className).not.toContain('green-500');
    expect(screen.getByText('Closing soon').className).not.toContain('orange-500');
  });

  it('renders primary action button', () => {
    const onClick = () => {};
    render(
      <DetailHero name="Test Show" primaryAction={{ label: 'Sign up for this show', onClick }} />
    );
    expect(screen.getByRole('button', { name: /sign up for this show/i })).toBeInTheDocument();
  });

  it('renders header actions beside the title area', () => {
    const { container } = render(
      <DetailHero
        name="Test Show"
        headerActions={<button type="button">More show actions</button>}
      />
    );
    expect(screen.getByRole('button', { name: /more show actions/i })).toBeInTheDocument();
    expect(container.querySelector('[class*="sm:w-auto"]')).toBeNull();
  });

  it('keeps header actions in document flow at every width, so they wrap instead of overlapping (MYK9-736)', () => {
    const { container } = render(
      <DetailHero
        cover={<div>Aug 1</div>}
        name="Heartland Scent Work Classic"
        headerActions={<button type="button">Published show</button>}
        secondaryActions={<button type="button">Share</button>}
      />
    );

    const heading = screen.getByRole('heading', { name: /heartland scent work classic/i });
    const actionContainer = screen.getByRole('button', { name: /published show/i }).parentElement;
    const classes = (actionContainer?.className ?? '').split(/\s+/);

    // An absolutely positioned cluster (it used to be `lg:absolute lg:right-6
    // lg:top-6`) takes no space, so from 1024px it sat on top of the side
    // actions and, with a long title, the title itself.
    expect(classes.filter(c => /(^|:)(absolute|fixed)$/.test(c))).toEqual([]);
    expect(classes).toContain('flex-wrap');
    // In the title's own column, so the column's width bounds it and it wraps
    // under the title rather than reaching into the side actions.
    const titleColumn = heading.closest('.min-w-0.flex-1');
    expect(titleColumn).not.toBeNull();
    expect(titleColumn?.contains(actionContainer ?? null)).toBe(true);
    const sideActions = screen.getByRole('button', { name: 'Share' }).closest('.items-end');
    expect(sideActions?.contains(actionContainer ?? null)).toBe(false);
    // Nothing reserves room for an overlay any more.
    expect(container.querySelector('[class*="pr-44"]')).toBeNull();
    expect(container.querySelector('[class*="flex-col"][class*="sm:flex-row"]')).toBeTruthy();
  });

  it('renders footer content', () => {
    render(<DetailHero name="Test Show" footer={<div data-testid="footer-content">footer</div>} />);
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });
});
