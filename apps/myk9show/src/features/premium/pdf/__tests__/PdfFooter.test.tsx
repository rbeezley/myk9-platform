import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PdfFooter } from '../PdfFooter';
import type { PremiumStyle } from '../../../../types/premium-types';

describe('PdfFooter', () => {
  it('renders the marketing link to myk9show.com on every style', () => {
    const styles: PremiumStyle[] = [
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage',
    ];
    for (const style of styles) {
      const { unmount } = render(<PdfFooter style={style} color="#888" />);
      const link = screen.getByText('Created by myK9Show.com').closest('a');
      expect(link?.getAttribute('href')).toBe('https://myk9show.com');
      unmount();
    }
  });

  it('shows a human-readable style label so QA can identify the source template', () => {
    render(<PdfFooter style="fieldGuide" color="#888" />);
    expect(screen.getByText('Style: Field Guide')).toBeInTheDocument();
  });
});
