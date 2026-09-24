/**
 * MYK9-623 AC1 — the Edit Entry sheet's removed-class badge reads its word
 * from the entry status grammar, not a literal of its own.
 *
 * The grammar descriptor is swapped for a sentinel here: a literal in the
 * component would still print "Pulled" / "Withdrawn" and this goes red. The
 * side-by-side agreement with My Shows is pinned in
 * `EntryEditDialog.lifecycleWord.test.tsx` against the REAL grammar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryEditClassRow } from './EntryEditClassRow';

vi.mock('@/components/status', async importOriginal => {
  const real = await importOriginal<typeof import('@/components/status')>();
  return {
    ...real,
    getStatusDescriptor: (family: 'entry' | 'class' | 'trial', status: string) => ({
      ...real.getStatusDescriptor(family, status),
      label: `grammar:${status}`,
    }),
  };
});

function renderRow(status: 'scratched' | 'withdrawn', reasonCode?: string) {
  return render(
    <EntryEditClassRow
      classEntry={{ id: 'c1', name: 'Container Novice', number: '', fee: 25, status }}
      status={status}
      reasonCode={reasonCode}
      rowEligibility={undefined}
      currentHandler=""
      currentJumpHeight={undefined}
      onLeaveClass={vi.fn()}
      onHandlerChange={vi.fn()}
      onJumpHeightChange={vi.fn()}
    />
  );
}

describe('EntryEditClassRow — the lifecycle word comes from the grammar (MYK9-623)', () => {
  it('names a stored pull with the grammar word', () => {
    renderRow('scratched');
    expect(screen.getByText('grammar:scratched')).toBeInTheDocument();
  });

  it('names a stored withdrawal with the grammar word, reason beside it', () => {
    renderRow('withdrawn', 'in_season');
    expect(screen.getByText('grammar:withdrawn · Dog in season')).toBeInTheDocument();
  });
});
