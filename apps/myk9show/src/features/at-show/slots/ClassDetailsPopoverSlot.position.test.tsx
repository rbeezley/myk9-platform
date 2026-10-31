import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClassDetailsPopover } from './ClassDetailsPopoverSlot';

function anchorAt(top: number, bottom: number) {
  const el = document.createElement('button');
  el.getBoundingClientRect = () =>
    ({ top, bottom, left: 40, right: 80, width: 40, height: bottom - top }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function renderPopover(anchor: HTMLElement) {
  const anchorRef = createRef<HTMLElement>();
  (anchorRef as { current: HTMLElement | null }).current = anchor;
  render(
    <ClassDetailsPopover
      isOpen
      onClose={() => {}}
      anchorRef={anchorRef}
      data={{ judgeName: 'Jane Judge' }}
    />
  );
  return screen.getByRole('dialog', { name: 'Class details' });
}

describe('ClassDetailsPopover anchored position', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens below a button near the top of the screen', async () => {
    vi.stubGlobal('innerHeight', 800);
    const dialog = renderPopover(anchorAt(100, 148));
    await vi.waitFor(() => expect(dialog.style.top).toBe('156px'));
    expect(dialog.style.bottom).toBe('');
  });

  it('opens upward from a button near the bottom, so it cannot run off the screen', async () => {
    vi.stubGlobal('innerHeight', 800);
    const dialog = renderPopover(anchorAt(700, 748));
    await vi.waitFor(() => expect(dialog.style.bottom).toBe('108px'));
    expect(dialog.style.top).toBe('');
    expect(parseInt(dialog.style.maxHeight, 10)).toBeLessThanOrEqual(700 - 16);
  });
});
