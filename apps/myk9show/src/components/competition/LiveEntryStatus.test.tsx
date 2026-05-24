import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveEntryStatus } from './LiveEntryStatus';
import type { EntryStatus } from '@/services/competition/liveCompetitionService';

function makeEntry(overrides: Partial<EntryStatus> = {}): EntryStatus {
  return {
    entryId: 'entry-1',
    dogId: 'dog-1',
    checkInStatus: 'checked-in',
    ringStatus: 'waiting',
    armband: '42',
    classId: 'class-1',
    sequence: 1,
    ringAssignment: 'Ring 2',
    updatedAt: new Date('2026-05-24T12:00:00Z'),
    updatedBy: 'user-1',
    ...overrides,
  };
}

function renderStatus(entry: EntryStatus) {
  return render(
    <LiveEntryStatus
      entryStatuses={new Map([[entry.entryId, entry]])}
      ringEvents={[]}
      callNotifications={[]}
      showId="show-1"
    />
  );
}

describe('LiveEntryStatus', () => {
  it('formats valid ring assignments', () => {
    renderStatus(makeEntry({ ringAssignment: '2' }));
    expect(screen.getByText('Ring 2')).toBeInTheDocument();
  });

  it('omits invalid legacy ring assignments', () => {
    renderStatus(makeEntry({ ringAssignment: 'Ring 0' }));
    expect(screen.queryByText(/Ring 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ring: Ring 0/)).not.toBeInTheDocument();
  });
});
