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

  it('keeps header actions in document flow through tablet widths', () => {
    const { container } = render(
      <DetailHero
        cover={<div>Aug 1</div>}
        name="Heartland Scent Work Classic"
        headerActions={<button type="button">Published show</button>}
      />
    );

    const actionContainer = screen.getByRole('button', { name: /published show/i }).parentElement;

    expect(actionContainer?.className).toContain('lg:absolute');
    expect(actionContainer?.className).not.toContain('sm:absolute');
    expect(container.querySelector('[class*="lg:pr-44"]')).toBeTruthy();
    expect(container.querySelector('[class*="flex-col"][class*="sm:flex-row"]')).toBeTruthy();
  });

  it('renders footer content', () => {
    render(<DetailHero name="Test Show" footer={<div data-testid="footer-content">footer</div>} />);
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });
});
