import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GazetteHeading } from '../components/GazetteHeading';

describe('GazetteHeading', () => {
  it('renders an h1 for level=1', () => {
    const { container } = render(<GazetteHeading level={1}>Title</GazetteHeading>);
    expect(container.querySelector('h1')).toBeInTheDocument();
    expect(container.querySelector('h1')).toHaveTextContent('Title');
  });

  it('renders an h2 with the gz-h h2 classes for level=2', () => {
    const { container } = render(<GazetteHeading level={2}>Sub</GazetteHeading>);
    const h2 = container.querySelector('h2');
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveClass('gz-h', 'h2');
  });

  it('renders an h3 with the gz-h h3 classes for level=3', () => {
    const { container } = render(<GazetteHeading level={3}>Tertiary</GazetteHeading>);
    expect(container.querySelector('h3')).toHaveClass('gz-h', 'h3');
  });

  it('applies italic class and inline italic style when italic prop is set', () => {
    const { container } = render(
      <GazetteHeading level={1} italic>
        Cordially
      </GazetteHeading>
    );
    expect(container.firstChild).toHaveClass('italic');
    expect(container.firstChild).toHaveStyle({ fontStyle: 'italic' });
  });

  it('omits italic class when prop is unset', () => {
    const { container } = render(<GazetteHeading level={1}>Plain</GazetteHeading>);
    expect(container.firstChild).not.toHaveClass('italic');
  });

  it('renders embedded <em> children for brown-accent emphasis', () => {
    const { container } = render(
      <GazetteHeading level={2}>
        The trial, <em>in particular</em>
      </GazetteHeading>
    );
    const em = container.querySelector('em');
    expect(em).toBeInTheDocument();
    expect(em).toHaveTextContent('in particular');
  });

  it('passes through className and id', () => {
    const { container } = render(
      <GazetteHeading level={1} id="lead-title" className="extra-class">
        Hello
      </GazetteHeading>
    );
    const h1 = container.querySelector('h1');
    expect(h1?.id).toBe('lead-title');
    expect(h1).toHaveClass('extra-class');
  });
});
