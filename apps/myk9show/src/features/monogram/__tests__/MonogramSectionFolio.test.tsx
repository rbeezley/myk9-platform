import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  MonogramSectionFolio,
} from '../components/MonogramSectionFolio';
import { toLowerRoman } from '../utils/roman';

describe('MonogramSectionFolio', () => {
  it('renders the supplied numeral', () => {
    const { getByText } = render(<MonogramSectionFolio numeral="iii" />);
    expect(getByText('iii')).toBeInTheDocument();
  });

  it('is decorative by default (aria-hidden)', () => {
    const { container } = render(<MonogramSectionFolio numeral="i" />);
    const span = container.querySelector('.mg-section-folio')!;
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses bronze color from the token palette', () => {
    const { container } = render(<MonogramSectionFolio numeral="ii" />);
    const span = container.querySelector('.mg-section-folio') as HTMLElement;
    expect(span.style.color).toBe('rgb(138, 105, 56)');
  });

  it('honors a custom size', () => {
    const { container } = render(<MonogramSectionFolio numeral="i" size={32} />);
    const span = container.querySelector('.mg-section-folio') as HTMLElement;
    expect(span.style.fontSize).toBe('32px');
  });
});

describe('toLowerRoman', () => {
  it('maps the first 8 integers to lowercase roman', () => {
    expect(toLowerRoman(1)).toBe('i');
    expect(toLowerRoman(2)).toBe('ii');
    expect(toLowerRoman(3)).toBe('iii');
    expect(toLowerRoman(4)).toBe('iv');
    expect(toLowerRoman(5)).toBe('v');
    expect(toLowerRoman(6)).toBe('vi');
    expect(toLowerRoman(7)).toBe('vii');
    expect(toLowerRoman(8)).toBe('viii');
  });

  it('falls back to arabic for n > 8 to keep layouts safe', () => {
    expect(toLowerRoman(9)).toBe('9');
    expect(toLowerRoman(12)).toBe('12');
  });

  it('passes through values < 1 unchanged for caller-side debugging', () => {
    expect(toLowerRoman(0)).toBe('0');
    expect(toLowerRoman(-1)).toBe('-1');
  });
});
