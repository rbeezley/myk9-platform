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

  it('renders footer content', () => {
    render(<DetailHero name="Test Show" footer={<div data-testid="footer-content">footer</div>} />);
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });
});
