import { render, screen } from '@/test/utils/testUtils';
import {
  CLASS_STATUS_VALUES,
  ENTRY_STATUS_VALUES,
  STATUS_COLOR_CLASSES,
  TRIAL_STATUS_VALUES,
  getStatusDescriptor,
} from './statusIconGrammar';
import { StatusIcon } from './StatusIcon';

const EXPECTED_ENTRY_STATUSES = [
  'no-status',
  'draft',
  'submitted',
  'paid',
  'confirmed',
  'scheduled',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'in-ring',
  'competing',
  'completed',
  'withdrawn',
  'not_accepted',
  'scratched',
  'absent',
  'moved',
  'scratch-requested',
  'move-up-requested',
  'pending-payment',
  'promotion-expired',
  'pending',
  'accepted',
  'waitlist',
  'missing_info',
  'conflict',
  'pulled',
  'checked_in',
  'not_checked_in',
  'at_gate',
  'in_ring',
] as const;

const EXPECTED_CLASS_STATUSES = [
  'Scheduled',
  'Upcoming',
  'In Progress',
  'Completed',
  'Cancelled',
  'no-status',
  'setup',
  'briefing',
  'break',
  'in_progress',
  'offline-scoring',
  'completed',
  'not-started',
  'in-progress',
  'not_started',
  'pending',
  'paused',
  'cancelled',
  'start_time',
] as const;

const EXPECTED_TRIAL_STATUSES = ['no-classes', 'not-started', 'in-progress', 'completed'] as const;

describe('status icon grammar', () => {
  it('covers every inventoried entry, class, and trial status', () => {
    expect(ENTRY_STATUS_VALUES).toEqual(EXPECTED_ENTRY_STATUSES);
    expect(CLASS_STATUS_VALUES).toEqual(EXPECTED_CLASS_STATUSES);
    expect(TRIAL_STATUS_VALUES).toEqual(EXPECTED_TRIAL_STATUSES);

    for (const status of EXPECTED_ENTRY_STATUSES) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of EXPECTED_CLASS_STATUSES) {
      expect(getStatusDescriptor('class', status).status).toBe(status);
    }
    for (const status of EXPECTED_TRIAL_STATUSES) {
      expect(getStatusDescriptor('trial', status).status).toBe(status);
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
          ? EXPECTED_ENTRY_STATUSES
          : family === 'class'
            ? EXPECTED_CLASS_STATUSES
            : EXPECTED_TRIAL_STATUSES;
      for (const status of statuses) {
        expect(STATUS_COLOR_CLASSES).toContain(getStatusDescriptor(family, status).colorClass);
      }
    }
  });
});
