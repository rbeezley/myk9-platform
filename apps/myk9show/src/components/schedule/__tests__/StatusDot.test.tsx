import { describe, it, expect } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { render } from '@/test/utils/testUtils';
import { StatusDot } from '../StatusDot';

const ALL_STATUSES: ClassStatusValue[] = [
  CLASS_STATUS.SCHEDULED,
  CLASS_STATUS.UPCOMING,
  CLASS_STATUS.IN_PROGRESS,
  CLASS_STATUS.COMPLETED,
  CLASS_STATUS.CANCELLED,
];

describe('StatusDot', () => {
  // Guards the dark-only-palette regression (the ShowStatusPill #666 class of
  // bug): every status fill must declare both a light and a dark value.
  it('gives every status a dark-mode counterpart', () => {
    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(<StatusDot status={status} />);
      const dot = container.querySelector('[aria-label]') as HTMLElement;
      expect(dot.className).toMatch(/dark:bg-/);
      unmount();
    }
  });

  // In-progress and completed dots carry status meaning, so they must use
  // shades that clear the 3:1 non-text contrast floor on a white card.
  it('uses contrast-safe shades for the meaningful statuses', () => {
    const inProgress = render(<StatusDot status={CLASS_STATUS.IN_PROGRESS} />);
    expect(
      (inProgress.container.querySelector('[aria-label]') as HTMLElement).className
    ).toContain('bg-amber-600');
    inProgress.unmount();

    const completed = render(<StatusDot status={CLASS_STATUS.COMPLETED} />);
    expect(
      (completed.container.querySelector('[aria-label]') as HTMLElement).className
    ).toContain('bg-green-600');
  });
});
