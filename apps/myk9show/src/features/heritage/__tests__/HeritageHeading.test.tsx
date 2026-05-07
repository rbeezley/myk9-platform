import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeritageHeading } from '../components/HeritageHeading';

describe('HeritageHeading', () => {
  it('renders an h1 for level=1', () => {
    const { container } = render(<HeritageHeading level={1}>Title</HeritageHeading>);
    expect(container.querySelector('h1')).toBeInTheDocument();
    expect(container.querySelector('h1')).toHaveTextContent('Title');
  });

  it('renders an h2 for level=2 with the size class', () => {
    const { container } = render(<HeritageHeading level={2}>Sub</HeritageHeading>);
    const h2 = container.querySelector('h2');
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveClass('hl-heading', 'h2');
  });

  it('renders an h3 for level=3 with the size class', () => {
    const { container } = render(<HeritageHeading level={3}>Tertiary</HeritageHeading>);
    expect(container.querySelector('h3')).toHaveClass('hl-heading', 'h3');
  });

  it('applies italic when italic prop is set', () => {
    const { container } = render(
      <HeritageHeading level={1} italic>
        Cordially
      </HeritageHeading>
    );
    expect(container.firstChild).toHaveClass('italic');
  });

  it('omits italic class when prop is unset', () => {
    const { container } = render(<HeritageHeading level={1}>Plain</HeritageHeading>);
    expect(container.firstChild).not.toHaveClass('italic');
  });
});
