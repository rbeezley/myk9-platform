import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazineSectionFolio } from '../components/MagazineSectionFolio';

describe('MagazineSectionFolio', () => {
  it('renders the label text', () => {
    const { container } = render(<MagazineSectionFolio label="The bench" />);
    expect(container.querySelector('.mz-section-folio__label')).toHaveTextContent('The bench');
  });

  it('wraps the label inside the .mz-section-folio host', () => {
    const { container } = render(<MagazineSectionFolio label="Plan your weekend" />);
    expect(container.firstChild).toHaveClass('mz-section-folio');
  });

  it('passes through a custom className', () => {
    const { container } = render(
      <MagazineSectionFolio label="On the day" className="mb-6" />
    );
    expect(container.firstChild).toHaveClass('mz-section-folio', 'mb-6');
  });

  it('does not inject any extra DOM nodes besides the label span', () => {
    const { container } = render(<MagazineSectionFolio label="Letter from the chair" />);
    // Only the host span + the label span — the gold rule flanking the
    // label is painted via ::before/::after pseudos, not real DOM nodes.
    expect(container.firstChild?.childNodes.length).toBe(1);
  });
});
