/**
 * MYK9-1944: a My Shows class row asks the results-public question on a released, placed
 * result and nowhere else. Whether to ask at all is the prompt's own rule (its own tests).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList } from './MyShowsList';
import type { EntryClass } from './my-entries-types';

// Every show is club-public here; the private-show skip is covered in firstResultsPromptClass.test.ts.
vi.mock('@/hooks/queries/useShowSettingsDatabase', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useShowSettingsDatabase')>()),
  useResultsPromptableShowIds: (ids: readonly string[]) => new Set(ids),
}));

vi.mock('@/components/preferences/ResultsPublicPrompt', () => ({
  ResultsPublicPrompt: (props: {
    showId: string;
    dogName: string;
    placement: number;
    handlerId?: string | null;
    ownerId?: string | null;
    coOwnerId?: string | null;
  }) => (
    <>
      <div data-testid="prompt">{`${props.showId}|${props.dogName}|${props.placement}`}</div>
      <div data-testid="prompt-ids">
        {[props.handlerId, props.ownerId, props.coOwnerId].map(id => String(id)).join('|')}
      </div>
    </>
  ),
}));

function renderClass(overrides: Partial<EntryClass>) {
  const rows = [
    makeRow({
      dogName: 'Scout',
      classes: [
        makeClass({
          isScored: true,
          resultStatus: 'qualified',
          searchTimeSeconds: 52.4,
          ...overrides,
        }),
      ],
    }),
  ];
  return render(
    <MyShowsList
      filteredEntries={toOrders(rows)}
      source="confirmed"
      seenResultReleaseKeys={new Set<string>()}
      now={NOW}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
      onLeaveClass={vi.fn()}
    />
  );
}

describe('My Shows list asks once (MYK9-1944)', () => {
  it('two placed, released rows render exactly one prompt', () => {
    const placed = { isScored: true, resultStatus: 'qualified', finalPlacement: 1 } as const;
    const released = '2026-10-24T18:00:00Z';
    const rows = [
      makeRow({
        dogName: 'Scout',
        classes: [
          makeClass({ id: 'c1', ...placed, resultsReleasedAt: released }),
          makeClass({ id: 'c2', name: 'Container Open A', ...placed, resultsReleasedAt: released }),
        ],
      }),
    ];
    render(
      <MyShowsList
        filteredEntries={toOrders(rows)}
        source="confirmed"
        seenResultReleaseKeys={new Set<string>()}
        now={NOW}
        onCheckInDay={vi.fn()}
        onOpenCheckIn={vi.fn()}
        onOpenEdit={vi.fn()}
        onOpenReceipts={vi.fn()}
        onLeaveClass={vi.fn()}
      />
    );
    expect(screen.getAllByTestId('prompt')).toHaveLength(1);
  });

  it('puts the prompt in the show block, outside every class row (MYK9-2386)', () => {
    renderClass({ finalPlacement: 1, resultsReleasedAt: '2026-10-24T18:00:00Z' });
    const prompt = screen.getByTestId('prompt');
    const classRow = document.querySelector('.myk9-entries-dog-classes');
    expect(classRow).not.toBeNull();
    expect(classRow?.contains(prompt)).toBe(false);
    expect(prompt.closest('section')?.contains(classRow)).toBe(true);
    // Its own block, placed before the dog list rather than inside any dog card.
    const block = screen.getByTestId('show-results-prompt');
    expect(block.contains(prompt)).toBe(true);
    const dogList = classRow?.closest('ul');
    expect(dogList).not.toBeNull();
    expect(
      dogList ? block.compareDocumentPosition(dogList) & Node.DOCUMENT_POSITION_FOLLOWING : 0
    ).toBeTruthy();
    // The class name keeps a readable width next to the prompt: no prompt inside its row.
    expect(screen.getAllByText('Container Novice A').length).toBeGreaterThan(0);
  });
});

describe('My Shows class row results-public prompt (MYK9-1944)', () => {
  it('renders the prompt on a released, placed result', () => {
    renderClass({ finalPlacement: 1, resultsReleasedAt: '2026-10-24T18:00:00Z' });
    expect(screen.getByTestId('prompt')).toHaveTextContent('show-heartland|Scout|1');
  });

  it('passes the handler, owner and co-owner ids through, keeping null and undefined apart', () => {
    renderClass({
      finalPlacement: 1,
      resultsReleasedAt: '2026-10-24T18:00:00Z',
      handlerId: null,
      dogOwnerId: 'person-1',
      dogCoOwnerId: 'person-2',
    });
    expect(screen.getByTestId('prompt-ids')).toHaveTextContent('null|person-1|person-2');
  });

  it('a row that does not carry the handler id passes undefined, not null', () => {
    renderClass({ finalPlacement: 1, resultsReleasedAt: '2026-10-24T18:00:00Z' });
    expect(screen.getByTestId('prompt-ids')).toHaveTextContent('undefined|undefined|undefined');
  });

  it('renders nothing for a result that did not place', () => {
    renderClass({ resultsReleasedAt: '2026-10-24T18:00:00Z' });
    expect(screen.queryByTestId('prompt')).not.toBeInTheDocument();
  });

  it('renders nothing before the class is released', () => {
    renderClass({ finalPlacement: 1 });
    expect(screen.queryByTestId('prompt')).not.toBeInTheDocument();
  });
});
