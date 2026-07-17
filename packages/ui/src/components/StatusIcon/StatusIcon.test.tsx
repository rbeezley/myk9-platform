import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIcon } from './StatusIcon';
import {
  CLASS_STATUS_VALUES,
  ENTRY_STATUS_VALUES,
  TRIAL_STATUS_VALUES,
  getStatusDescriptor,
  getStatusSurfaceClasses,
} from './statusIconGrammar';

describe('StatusIcon', () => {
  it('maps every declared family value to itself', () => {
    for (const status of ENTRY_STATUS_VALUES) {
      expect(getStatusDescriptor('entry', status).status).toBe(status);
    }
    for (const status of CLASS_STATUS_VALUES) {
      expect(getStatusDescriptor('class', status).status).toBe(status);
    }
    for (const status of TRIAL_STATUS_VALUES) {
      expect(getStatusDescriptor('trial', status).status).toBe(status);
    }
  });

  it('maps persisted request aliases without falling back', () => {
    expect(getStatusDescriptor('entry', 'scratch_requested')).toMatchObject({
      status: 'scratch_requested',
      shape: 'needs-attention',
    });
    expect(getStatusDescriptor('entry', 'move_up_requested')).toMatchObject({
      status: 'move_up_requested',
      shape: 'needs-attention',
    });
  });

  it('uses one complete shape across all families', () => {
    render(
      <>
        <StatusIcon family="entry" status="completed" />
        <StatusIcon family="class" status="Completed" />
        <StatusIcon family="trial" status="completed" />
      </>
    );

    for (const icon of screen.getAllByRole('img', { name: 'Completed' })) {
      expect(icon).toHaveAttribute('data-shape', 'complete');
    }
  });

  it('falls back safely for an unknown value', () => {
    render(<StatusIcon family="entry" status="future-status" />);
    expect(screen.getByRole('img', { name: 'No Status' })).toHaveAttribute(
      'data-shape',
      'not-started'
    );
  });

  it('uses a neutral trial fallback for unknown and missing values', () => {
    expect(getStatusDescriptor('trial', 'future-status')).toMatchObject({
      status: 'no-status',
      label: 'No Status',
      shape: 'not-started',
    });
    expect(getStatusDescriptor('trial', undefined).status).toBe('no-status');
  });

  it('derives badge surfaces from the shared semantic color', () => {
    expect(getStatusSurfaceClasses('entry', 'checked-in')).toBe('bg-info/10 text-info');
    expect(getStatusSurfaceClasses('entry', 'future-status')).toBe(
      'bg-muted text-muted-foreground'
    );
  });

  it('preserves cancelled trials as a terminal destructive state', () => {
    render(<StatusIcon family="trial" status="cancelled" />);

    expect(screen.getByRole('img', { name: 'Cancelled' })).toHaveAttribute(
      'data-shape',
      'complete'
    );
    expect(screen.getByRole('img', { name: 'Cancelled' })).toHaveClass('text-destructive');
  });
});
