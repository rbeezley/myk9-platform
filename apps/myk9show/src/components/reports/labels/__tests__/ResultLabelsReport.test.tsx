import { render, screen } from '@testing-library/react';
import { ResultLabelsReport } from '../ResultLabelsReport';

// The config panel (label-size radios, skip field, pitch slider) renders off
// the static template list, so it appears even with no entries to print. That
// lets these tests focus purely on the control migration without constructing
// full DbEntry/DbTrial/DbClass fixtures.
const baseProps = {
  show: null,
  trials: [],
  classes: [],
  entries: [],
  trialId: 'all',
  classId: 'all',
  sortOrder: 'armband',
} as const;

describe('ResultLabelsReport config panel', () => {
  it('renders the inline config panel', () => {
    render(<ResultLabelsReport {...baseProps} />);
    expect(screen.getByText(/Label Size/i)).toBeInTheDocument();
  });

  it('uses shadcn primitives, not raw native radio/range inputs', () => {
    render(<ResultLabelsReport {...baseProps} />);
    // Base UI's Radio renders an accessible non-input element (its form
    // <input> is hidden from the a11y tree); a raw native radio would expose
    // an <input> in the a11y tree instead.
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio.tagName).not.toBe('INPUT');
    }
    // The Slider primitive renders <input type="range"> (role slider) with an
    // accessible name.
    expect(
      screen.getByRole('slider', { name: /vertical pitch adjustment/i })
    ).toBeInTheDocument();
  });

  it('gives every label-size radio row a 44px-tall hit area', () => {
    render(<ResultLabelsReport {...baseProps} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      const row = radio.closest('label');
      expect(row).not.toBeNull();
      expect(row?.className).toContain('min-h-[44px]');
    }
  });

  it('gives the skip-count field a 44px-tall hit area', () => {
    render(<ResultLabelsReport {...baseProps} />);
    const skip = screen.getByLabelText('Labels to skip on first page');
    expect(skip).toHaveClass('h-11');
    expect(skip.closest('label')?.className).toContain('min-h-[44px]');
  });
});
