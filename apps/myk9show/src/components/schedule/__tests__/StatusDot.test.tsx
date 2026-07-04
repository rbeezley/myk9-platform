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
  // bug): every status fill must adapt in dark mode, either via a self-theming
  // semantic token (bg-warning/bg-success for active states,
  // bg-muted-foreground for neutral ones) or an explicit dark: variant. Raw
  // palette fills with no dark counterpart (bg-slate-500) are what render
  // near-black in light mode and are disallowed.
  it('gives every status a dark-mode-aware colour', () => {
    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(<StatusDot status={status} />);
      const dot = container.querySelector('[aria-label]') as HTMLElement;
      const hasSemanticToken = /bg-(warning|success|destructive|info|muted-foreground)/.test(
        dot.className
      );
      const hasDarkVariant = /dark:bg-/.test(dot.className);
      expect(hasSemanticToken || hasDarkVariant).toBe(true);
      unmount();
    }
  });

  // Neutral states use the self-theming --muted-foreground token rather than a
  // raw palette fill, so they read correctly in both modes without a dark:
  // variant and never render near-black in light mode.
  it('uses the muted-foreground token (not raw slate) for neutral statuses', () => {
    for (const status of [
      CLASS_STATUS.SCHEDULED,
      CLASS_STATUS.UPCOMING,
      CLASS_STATUS.CANCELLED,
    ]) {
      const { container, unmount } = render(<StatusDot status={status} />);
      const className = (container.querySelector('[aria-label]') as HTMLElement).className;
      expect(className).toContain('bg-muted-foreground');
      expect(className).not.toMatch(/slate/);
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

  it('exposes the class status as an accessible status name', () => {
    const { getByRole } = render(<StatusDot status={CLASS_STATUS.IN_PROGRESS} />);

    expect(getByRole('status', { name: 'Status: In Progress' })).toBeInTheDocument();
  });
});
