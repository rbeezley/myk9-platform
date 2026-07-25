import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils/testUtils';
import Footer from './Footer';

describe('Footer', () => {
  it('links to the real legal routes', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms'
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('does not render placeholder contact or social links', () => {
    render(<Footer />);
    expect(screen.queryByText(/555\) 123-4567/)).not.toBeInTheDocument();
    expect(screen.queryByText('San Francisco, CA')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Twitter')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Facebook')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: '#' })).toHaveLength(0);
  });

  it('shows a real contact email', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'hello@myk9show.com' })).toHaveAttribute(
      'href',
      'mailto:hello@myk9show.com'
    );
  });
});
