import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';

describe('SlideOverPanel stacking (MYK9-1666)', () => {
  it('mounts under <body>, outside a host that makes its own stacking context', () => {
    const { container } = render(
      <header style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <SlideOverPanel open onClose={() => {}} title="Menu">
          <p>content</p>
        </SlideOverPanel>
      </header>
    );

    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('header')).toBeNull();
    expect(dialog.parentElement).toBe(document.body);
  });
});
