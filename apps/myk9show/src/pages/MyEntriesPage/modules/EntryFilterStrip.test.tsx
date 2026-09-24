/**
 * MYK9-657 — the strip states how its two rows narrow each other, and a
 * narrowed 0 reads differently from "none at all".
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryFilterStrip } from './EntryFilterStrip';
import type { EntryStatusFilter, EntryTabFilter } from './my-entries-types';

function renderStrip(
  selectedTab: EntryTabFilter,
  selectedStatus: EntryStatusFilter,
  statusCounts: Record<EntryStatusFilter, number>,
  statusCountsAllWindows: Record<EntryStatusFilter, number>
) {
  return render(
    <EntryFilterStrip
      selectedTab={selectedTab}
      onSelectTab={vi.fn()}
      tabCounts={{ all: 2, upcoming: 1, completed: 1 }}
      selectedStatus={selectedStatus}
      onSelectStatus={vi.fn()}
      statusCounts={statusCounts}
      statusCountsAllWindows={statusCountsAllWindows}
    />
  );
}

describe('EntryFilterStrip — scoped counts (MYK9-657)', () => {
  it('says where a narrowed 0 is, and keeps a true 0 bare', () => {
    renderStrip(
      'completed',
      'any',
      { any: 1, pending: 0, accepted: 1, waitlist: 0 },
      { any: 2, pending: 1, accepted: 1, waitlist: 0 }
    );

    expect(screen.getByRole('radio', { name: /^Pending/ })).toHaveTextContent(
      'Pending0 in Completed'
    );
    expect(screen.getByRole('radio', { name: /^Waitlist/ })).toHaveTextContent(/^Waitlist0$/);
  });

  it('states which row narrows the other', () => {
    renderStrip(
      'completed',
      'pending',
      { any: 1, pending: 0, accepted: 1, waitlist: 0 },
      { any: 2, pending: 1, accepted: 1, waitlist: 0 }
    );

    expect(
      screen.getByText(
        'Status counts are for completed shows only. When counts are for pending entries only.'
      )
    ).toBeInTheDocument();
  });

  it('says nothing extra when neither row narrows', () => {
    renderStrip(
      'all',
      'any',
      { any: 2, pending: 1, accepted: 1, waitlist: 0 },
      { any: 2, pending: 1, accepted: 1, waitlist: 0 }
    );

    expect(screen.queryByText(/counts are for/)).not.toBeInTheDocument();
  });
});
