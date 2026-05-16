import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazineHeading } from '../components/MagazineHeading';

describe('MagazineHeading', () => {
  it('renders an h1 for level=1 with the size class', () => {
    const { container } = render(<MagazineHeading level={1}>Title</MagazineHeading>);
    const h1 = container.querySelector('h1');
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveClass('mz-heading', 'h1');
    expect(h1).toHaveTextContent('Title');
  });

  it('renders an h2 for level=2 with the size class', () => {
    const { container } = render(<MagazineHeading level={2}>Sub</MagazineHeading>);
    expect(container.querySelector('h2')).toHaveClass('mz-heading', 'h2');
  });

  it('renders an h3 for level=3 with the size class', () => {
    const { container } = render(<MagazineHeading level={3}>Tertiary</MagazineHeading>);
    expect(container.querySelector('h3')).toHaveClass('mz-heading', 'h3');
  });

  it('renders an h4 for level=4 with the size class', () => {
    const { container } = render(<MagazineHeading level={4}>Quaternary</MagazineHeading>);
    expect(container.querySelector('h4')).toHaveClass('mz-heading', 'h4');
  });

  it('applies italic when italic prop is set', () => {
    const { container } = render(
      <MagazineHeading level={1} italic>
        Cordially
      </MagazineHeading>
    );
    expect(container.firstChild).toHaveClass('italic');
  });

  it('omits italic class when prop is unset', () => {
    const { container } = render(<MagazineHeading level={1}>Plain</MagazineHeading>);
    expect(container.firstChild).not.toHaveClass('italic');
  });

  it('passes through a custom className', () => {
    const { container } = render(
      <MagazineHeading level={2} className="extra">
        Sub
      </MagazineHeading>
    );
    expect(container.firstChild).toHaveClass('extra');
  });

  it('renders inline em with em-gold class', () => {
    const { container } = render(
      <MagazineHeading level={2}>
        Spring <em className="em-gold">Scent Work</em>
      </MagazineHeading>
    );
    expect(container.querySelector('em.em-gold')).toHaveTextContent('Scent Work');
  });
});
