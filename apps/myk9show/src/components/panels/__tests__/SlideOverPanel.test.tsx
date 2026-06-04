import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';

describe('SlideOverPanel side support', () => {
  it('defaults to a right-side panel', () => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title="Panel">
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    expect(panel).toHaveClass('right-0');
    expect(panel).toHaveClass('rounded-l-xl');
  });

  it('can render as a left-side panel', () => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title="Message Center" side="left">
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    expect(panel).toHaveClass('left-0');
    expect(panel).toHaveClass('rounded-r-xl');
  });
});
