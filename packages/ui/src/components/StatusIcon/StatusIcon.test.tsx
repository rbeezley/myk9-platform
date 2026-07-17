import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIcon } from './StatusIcon';
import {
  CLASS_STATUS_VALUES,
  ENTRY_STATUS_VALUES,
  TRIAL_STATUS_VALUES,
  getStatusDescriptor,
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
});
