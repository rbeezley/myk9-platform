import { render, screen } from '@/test/utils/testUtils';
import { CLASS_STATUS, type ClassStatusValue } from '@myk9/core';
import { EntryStatus } from '@/types/show-registration-types';
import { ENTRY_LIFECYCLE_STATUS_VALUES } from '@/types/entry-lifecycle';
import { CLASS_ENTRY_STATUS_VALUES } from '@/types/entry-refactored-types';
import { EXHIBITOR_CHECK_IN_STATUS_VALUES } from '@/types/exhibitor-types';
import {
  CLASS_STATUS_VALUES,
  ENTRY_STATUS_VALUES,
  STATUS_COLOR_CLASSES,
  TRIAL_STATUS_VALUES,
  getStatusDescriptor,
  getTrialCompositeStatus,
} from './statusIconGrammar';
import { StatusIcon } from './StatusIcon';
import { StatusBadge } from './StatusBadge';

describe('status icon grammar', () => {
  it('covers every declared and canonical entry, class, and trial status', () => {
    for (const status of ENTRY_STATUS_VALUES) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of Object.values(EntryStatus)) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of ENTRY_LIFECYCLE_STATUS_VALUES) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of CLASS_ENTRY_STATUS_VALUES) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of EXHIBITOR_CHECK_IN_STATUS_VALUES) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of CLASS_STATUS_VALUES) {
      expect(getStatusDescriptor('class', status).status).toBe(status);
    }
    for (const status of Object.values(CLASS_STATUS)) {
      expect(getStatusDescriptor('class', status).status).toBe(status);
    }
    for (const status of TRIAL_STATUS_VALUES) {
      expect(getStatusDescriptor('trial', status).status).toBe(status);
    }

    const trialStatusByCanonicalClassStatus = {
      [CLASS_STATUS.SCHEDULED]: 'not-started',
      [CLASS_STATUS.UPCOMING]: 'not-started',
      [CLASS_STATUS.IN_PROGRESS]: 'in-progress',
      [CLASS_STATUS.COMPLETED]: 'completed',
      [CLASS_STATUS.CANCELLED]: 'cancelled',
    } satisfies Record<ClassStatusValue, (typeof TRIAL_STATUS_VALUES)[number]>;

    for (const [status, expected] of Object.entries(trialStatusByCanonicalClassStatus)) {
      expect(getTrialCompositeStatus(status, 1)).toBe(expected);
    }
  });

  it('uses the same complete shape across status families', () => {
    render(
      <>
        <StatusIcon family="entry" status="completed" />
        <StatusIcon family="class" status="Completed" />
        <StatusIcon family="trial" status="completed" />
      </>
    );

    expect(screen.getAllByRole('img', { name: 'Completed' })).toHaveLength(3);
    for (const icon of screen.getAllByRole('img', { name: 'Completed' })) {
      expect(icon).toHaveAttribute('data-shape', 'complete');
    }
  });

  it('renders unknown and undefined statuses as the neutral no-status fallback', () => {
    expect(getStatusDescriptor('entry', 'future-status')).toMatchObject({
      status: 'no-status',
      label: 'No Status',
      shape: 'not-started',
    });
    expect(getStatusDescriptor('trial', undefined)).toMatchObject({
      status: 'no-classes',
      label: 'No classes yet',
      shape: 'not-started',
    });

    render(<StatusIcon family="class" status="future-status" />);
    expect(screen.getByRole('img', { name: 'Not started' })).toHaveAttribute(
      'data-shape',
      'not-started'
    );
  });

  it('uses only the contrast-verified semantic status color tokens', () => {
    expect(STATUS_COLOR_CLASSES).toEqual([
      'text-muted-foreground',
      'text-warning',
      'text-info',
      'text-success',
      'text-destructive',
    ]);

    for (const family of ['entry', 'class', 'trial'] as const) {
      const statuses =
        family === 'entry'
          ? ENTRY_STATUS_VALUES
          : family === 'class'
            ? CLASS_STATUS_VALUES
            : TRIAL_STATUS_VALUES;
      for (const status of statuses) {
        expect(STATUS_COLOR_CLASSES).toContain(getStatusDescriptor(family, status).colorClass);
      }
    }
  });

  it('defaults status badges to a neutral outline behind semantic icon colors', () => {
    render(<StatusBadge family="entry" status="accepted" />);

    const badge = screen.getByText('Accepted').parentElement;
    expect(badge).toHaveClass('text-foreground');
    expect(badge).not.toHaveClass('bg-primary');
    expect(badge?.querySelector('[data-family="entry"]')).toHaveClass('text-info');
  });
});
