import { describe, expect, it } from 'vitest';
import { getStatusBadge } from './entryListHeaderHelpers';

describe('entry-list header status visibility', () => {
  it('preserves the established visible status set', () => {
    expect(getStatusBadge('in_progress')).not.toBeNull();
    expect(getStatusBadge('briefing')).not.toBeNull();
    expect(getStatusBadge('start_time')).not.toBeNull();
    expect(getStatusBadge('setup')).not.toBeNull();

    expect(getStatusBadge('cancelled')).not.toBeNull();

    expect(getStatusBadge('completed')).toBeNull();
    expect(getStatusBadge('no-status')).toBeNull();
    expect(getStatusBadge('break')).toBeNull();
    expect(getStatusBadge('offline')).toBeNull();
  });

  it('labels a cancelled class CANCELLED in the neutral style', () => {
    expect(getStatusBadge('cancelled')).toEqual({
      text: 'CANCELLED',
      className: 'status-neutral',
    });
  });
});
