import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeritageSectionFolio } from '../components/HeritageSectionFolio';

describe('HeritageSectionFolio', () => {
  it('renders "§ <numeral>" with the section sign and a space', () => {
    const { container } = render(<HeritageSectionFolio numeral="III" />);
    expect(container.textContent).toBe('§ III');
  });

  it('uses the hl-sec-folio class so nowrap + min-width rules apply', () => {
    // The handoff README calls out white-space:nowrap + min-width:32px as a
    // critical rule preventing § and the numeral from line-breaking.
    const { container } = render(<HeritageSectionFolio numeral="I" />);
    expect(container.firstChild).toHaveClass('hl-sec-folio');
  });

  it('passes through extra classes', () => {
    const { container } = render(<HeritageSectionFolio numeral="II" className="extra" />);
    expect(container.firstChild).toHaveClass('hl-sec-folio', 'extra');
  });
});
