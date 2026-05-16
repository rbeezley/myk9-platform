import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazinePullQuote } from '../components/MagazinePullQuote';

const QUOTE =
  'The point of a trial is the dog and the work. The point of a club is the people.';

describe('MagazinePullQuote', () => {
  it('renders inside a blockquote element', () => {
    const { container } = render(<MagazinePullQuote quote={QUOTE} />);
    const bq = container.querySelector('blockquote');
    expect(bq).toBeInTheDocument();
    expect(bq).toHaveClass('mz-pullquote');
  });

  it('renders the quote text', () => {
    const { container } = render(<MagazinePullQuote quote={QUOTE} />);
    expect(container.querySelector('.mz-pullquote__text')).toHaveTextContent(QUOTE);
  });

  it('renders the attribution when provided', () => {
    const { container } = render(
      <MagazinePullQuote quote={QUOTE} attribution="— BCKC Constitution, Article I" />
    );
    expect(container.querySelector('.mz-pullquote__attrib')).toHaveTextContent(
      '— BCKC Constitution, Article I'
    );
  });

  it('omits the attribution slot when null', () => {
    const { container } = render(<MagazinePullQuote quote={QUOTE} attribution={null} />);
    expect(container.querySelector('.mz-pullquote__attrib')).toBeNull();
  });

  it('omits the attribution slot when undefined', () => {
    const { container } = render(<MagazinePullQuote quote={QUOTE} />);
    expect(container.querySelector('.mz-pullquote__attrib')).toBeNull();
  });

  it('passes through a custom className', () => {
    const { container } = render(<MagazinePullQuote quote={QUOTE} className="my-12" />);
    expect(container.firstChild).toHaveClass('mz-pullquote', 'my-12');
  });
});
