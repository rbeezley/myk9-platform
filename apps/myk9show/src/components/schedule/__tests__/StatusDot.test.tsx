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
  // Guards the dark-mode-adaption regression (the ShowStatusPill #666 class of
  // bug): every status fill must adapt in dark mode — either via a semantic
  // token (bg-warning, bg-success) or an explicit dark: variant.
  it('gives every status a dark-mode-aware colour', () => {
    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(<StatusDot status={status} />);
      const dot = container.querySelector('[aria-label]') as HTMLElement;
      const hasSemanticToken = /bg-(warning|success|destructive|info)/.test(dot.className);
      const hasDarkVariant = /dark:bg-/.test(dot.className);
      expect(hasSemanticToken || hasDarkVariant).toBe(true);
      unmount();
    }
  });

  // In-progress and completed dots carry status meaning and use semantic tokens
  // that automatically adapt in dark mode.
  it('uses semantic tokens for the meaningful statuses', () => {
    const inProgress = render(<StatusDot status={CLASS_STATUS.IN_PROGRESS} />);
    expect(
      (inProgress.container.querySelector('[aria-label]') as HTMLElement).className
    ).toContain('bg-warning');
    inProgress.unmount();

    const completed = render(<StatusDot status={CLASS_STATUS.COMPLETED} />);
    expect(
      (completed.container.querySelector('[aria-label]') as HTMLElement).className
    ).toContain('bg-success');
  });
});
