import { describe, expect, it } from 'vitest';

import { render, screen } from '@/test/utils/testUtils';
import { MyK9ShowMark } from '../MyK9ShowMark';

describe('MyK9ShowMark', () => {
  it('renders as a decorative mark by default', () => {
    const { container } = render(<MyK9ShowMark data-testid="mark" />);

    expect(screen.getByTestId('mark')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg path')).toHaveAttribute(
      'stroke',
      'var(--myk9-logo-accent, currentColor)',
    );
  });

  it('can be labeled when used standalone', () => {
    render(<MyK9ShowMark title="myK9Show" />);

    expect(screen.getByRole('img', { name: 'myK9Show' })).toBeInTheDocument();
  });
});
