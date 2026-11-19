import { fromAny } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';

import { calculateResultsRowsLeft } from '@/features/show-closeout/fromResultsRows';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial } from '@/store/trial-store-types';
import { render } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import type { ResultsClassPhase } from './resultsNextAction';
import { ResultsFinishRow } from './ResultsFinishRow';

const RELEASED = '2026-11-01T20:00:00Z';

const trialFor = (registryId?: string, id = 'trial-1') =>
  ({ id, showId: 'show-1', registryId }) as unknown as SyncableTrial;

function row(
  id: string,
  phase: ResultsClassPhase,
  overrides: Partial<ResultsClassRow> = {}
): ResultsClassRow {
  const cancelled = phase === 'cancelled';
  const noDogs = phase === 'no-dogs';
  const released = ['released', 'needs-initials', 'done'].includes(phase);
  return fromAny<ResultsClassRow, unknown>({
    id,
    trialId: 'trial-1',
    phase,
    expectedCount: noDogs || cancelled ? 0 : 4,
    scoredCount: noDogs || cancelled ? 0 : 4,
    releasedAt: released ? RELEASED : null,
    judgeSignedOffAt: phase === 'done' || phase === 'released' ? RELEASED : null,
    takesJudgeSignOff: !cancelled && !noDogs,
    ...overrides,
  });
}

// A show with a cancelled class and a class with no dogs among the real ones.
const SHOW_ROWS = [
  row('open-1', 'ready-to-release'),
  row('open-2', 'ready-to-release'),
  row('to-print', 'released'),
  row('to-initial', 'needs-initials'),
  row('finished', 'done'),
  row('cancelled', 'cancelled'),
  row('empty', 'no-dogs'),
];

function renderList(
  rows: ResultsClassRow[],
  trials: SyncableTrial[],
  entries: SecretaryEntry[] = []
) {
  render(
    <ResultsFinishRow
      showId="show-1"
      trials={trials}
      rows={rows}
      entries={entries}
      entriesTrusted
    />
  );
  return within(screen.getByRole('region', { name: 'Finish the show' }));
}

describe('ResultsFinishRow', () => {
  it('shows the counts of the one calculation, cancelled and empty classes left out', () => {
    const list = renderList(SHOW_ROWS, [trialFor('AKC')]);
    const left = calculateResultsRowsLeft(SHOW_ROWS, [trialFor('AKC')]);
    const line = (kind: string) => left.lines.find(candidate => candidate.kind === kind);

    expect(line('unreleased')?.count).toBe(2);
    expect(line('to-print')?.count).toBe(1);
    expect(line('judge-sign-off')?.count).toBe(1);
    expect(list.getByRole('link', { name: '2 classes to release' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: '1 class with results to print' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: "1 class needs judge's initials" })).toBeInTheDocument();
  });

  it('links each line to a view filtered to the classes it counted', () => {
    const list = renderList(SHOW_ROWS, [trialFor('AKC')]);

    expect(list.getByRole('link', { name: '2 classes to release' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=unreleased'
    );
    expect(list.getByRole('link', { name: '1 class with results to print' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=to-print'
    );
    expect(list.getByRole('link', { name: "1 class needs judge's initials" })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=akc-judge-initials'
    );
    expect(list.getByRole('link', { name: 'Submit to AKC' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=submit'
    );
    expect(list.getByRole('link', { name: 'Close the show' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );
  });

  it('ticks a line with nothing left', () => {
    const list = renderList([row('a', 'done'), row('b', 'cancelled')], [trialFor('AKC')]);

    expect(list.getByText('Every class is released')).toBeInTheDocument();
    expect(list.getByText('Results printed for every released class')).toBeInTheDocument();
    expect(list.getByText("Judge's initials collected")).toBeInTheDocument();
    expect(list.getAllByLabelText('Done')).toHaveLength(3);
    expect(list.queryByRole('link', { name: /to release/ })).not.toBeInTheDocument();
  });

  it('a ticked line is plain text, not a link; an open line keeps its link', () => {
    const list = renderList(
      [row('a', 'done'), row('b', 'cancelled'), row('c', 'released')],
      [trialFor('AKC')]
    );

    expect(list.queryByRole('link', { name: /Every class is released/ })).not.toBeInTheDocument();
    expect(list.getByText('Every class is released').closest('a')).toBeNull();
    expect(list.getByRole('link', { name: '1 class with results to print' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=to-print'
    );
  });

  it.each([
    ['AKC', 'Submit to AKC', ['Submit to UKC', 'Submit to ASCA']],
    ['UKC', 'Submit to UKC', ['Submit to AKC', 'Submit to ASCA']],
    ['ASCA', 'Submit to ASCA', ['Submit to AKC', 'Submit to UKC']],
  ])('%s shows its own lines and none of the others', (registryId, own, others) => {
    const list = renderList(SHOW_ROWS, [trialFor(registryId)]);

    expect(list.getByRole('link', { name: own })).toBeInTheDocument();
    for (const other of others) expect(list.queryByRole('link', { name: other })).toBeNull();
  });

  it('words the judge line for the registry', () => {
    const list = renderList(SHOW_ROWS, [trialFor('UKC')]);

    expect(list.getByRole('link', { name: '1 class needs judge signature' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=ukc-judge-signature'
    );
  });

  it('keeps Close the show when the show has no classes or trials yet', () => {
    const list = renderList([], []);

    expect(list.getByRole('link', { name: 'Close the show' })).toBeInTheDocument();
  });

  it('opens the after-show packet for the trial, and names the trial when there are several', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const first = {
      ...trialFor('AKC'),
      id: 'trial-1',
      name: 'Trial 1',
    } as unknown as SyncableTrial;
    const second = {
      ...trialFor('AKC'),
      id: 'trial-2',
      name: 'Trial 2',
    } as unknown as SyncableTrial;
    render(
      <ResultsFinishRow
        showId="show-1"
        trials={[first, second]}
        rows={SHOW_ROWS}
        entries={[]}
        entriesTrusted
        onOpenAfterShow={onOpen}
      />
    );

    await user.click(screen.getByRole('button', { name: 'After-show packet: Trial 2' }));

    expect(onOpen).toHaveBeenCalledWith('trial-2');
    expect(screen.getByRole('button', { name: 'After-show packet: Trial 1' })).toBeInTheDocument();
  });

  it('calls the single trial\'s button plain "After-show packet"', () => {
    render(
      <ResultsFinishRow
        showId="show-1"
        trials={[trialFor('AKC')]}
        rows={SHOW_ROWS}
        entries={[]}
        entriesTrusted
        onOpenAfterShow={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'After-show packet' })).toBeInTheDocument();
  });

  // MYK9-2184: one accessible query for presence AND absence. The absence checks used to search
  // for /share a handler/, which never matches the real label, so they passed with the warning up.
  const HANDLER_LINE = {
    name: /^\d+ dogs? have the same handler as another dog in their class\./,
  };
  const handlerEntry = (id: string, handlerId?: string | null, overrides = {}) =>
    fromAny<SecretaryEntry, unknown>({
      id,
      class_id: 'open-1',
      entry_status: 'confirmed',
      ...(handlerId === undefined ? {} : { handler_id: handlerId }),
      ...overrides,
    });
  const renderHandlers = (entries: SecretaryEntry[], entriesTrusted = true) => {
    render(
      <ResultsFinishRow
        showId="show-1"
        trials={[trialFor('AKC')]}
        rows={SHOW_ROWS}
        entries={entries}
        entriesTrusted={entriesTrusted}
      />
    );
    return within(screen.getByRole('region', { name: 'Finish the show' }));
  };

  it('positive control: two dogs sharing a handler show the link to those entries (MYK9-2031)', () => {
    const list = renderHandlers([handlerEntry('e1', 'p1'), handlerEntry('e2', 'p1')]);

    const link = list.getByRole('link', HANDLER_LINE);
    expect(link).toHaveAccessibleName(
      '2 dogs have the same handler as another dog in their class. Choose who handles each before printing the marked catalog.'
    );
    expect(link).toHaveAttribute('href', '/shows/show-1/entries?class=open-1');
  });

  it('the old absence matcher cannot see the warning, the shared query can', () => {
    const list = renderHandlers([handlerEntry('e1', 'p1'), handlerEntry('e2', 'p1')]);

    expect(list.queryByText(/share a handler/)).not.toBeInTheDocument();
    expect(list.queryByRole('link', HANDLER_LINE)).toBeInTheDocument();
  });

  it('drops the line once one dog is reassigned to another handler', () => {
    const list = renderHandlers([handlerEntry('e1', 'p1'), handlerEntry('e2', 'p2')]);

    expect(list.queryByRole('link', HANDLER_LINE)).not.toBeInTheDocument();
  });

  it('says nothing about handlers while the entries read is stale, even with a clash in it', () => {
    const list = renderHandlers([handlerEntry('e1', 'p1'), handlerEntry('e2', 'p1')], false);

    expect(list.queryByRole('link', HANDLER_LINE)).not.toBeInTheDocument();
  });

  it('says nothing about handlers while a live entry lacks handler_id (incomplete projection)', () => {
    const list = renderHandlers([
      handlerEntry('e1', 'p1'),
      handlerEntry('e2', 'p1'),
      handlerEntry('e3'),
    ]);

    expect(list.queryByRole('link', HANDLER_LINE)).not.toBeInTheDocument();
  });

  it('ignores a withdrawn entry that lacks handler_id when the rest is complete and clashing', () => {
    const list = renderHandlers([
      handlerEntry('e1', 'p1'),
      handlerEntry('e2', 'p1'),
      handlerEntry('e3', undefined, { entry_status: 'withdrawn' }),
    ]);

    expect(list.getByRole('link', HANDLER_LINE)).toBeInTheDocument();
  });

  // MYK9-2145: a flag stays a flag until the secretary confirms it at the Check-in desk.
  const flagged = (id: string, dogId: string, entryStatus = 'confirmed') =>
    fromAny<SecretaryEntry, unknown>({
      id,
      dog_id: dogId,
      class_id: 'open-1',
      entry_status: entryStatus,
      check_in_status: 'pulled',
      is_scored: false,
      payment_status: 'paid',
      payment_method: 'online',
    });
  const FLAG_LABEL = '2 dogs flagged as pulled at the show, not confirmed.';

  it('lists unconfirmed pull flags with a link to the Check-in desk, the other lines unchanged', () => {
    const list = renderList(
      SHOW_ROWS,
      [trialFor('AKC')],
      [flagged('e1', 'dog-1'), flagged('e2', 'dog-2')]
    );

    expect(list.getByRole('link', { name: FLAG_LABEL })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?tab=exceptions&exception=check-in'
    );
    expect(list.getByRole('link', { name: '2 classes to release' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: '1 class with results to print' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: 'Close the show' })).toBeInTheDocument();
  });

  it('lists no flag line once the desk confirmed the pull, or while the entries read is stale', () => {
    const { unmount } = render(
      <ResultsFinishRow
        showId="show-1"
        trials={[trialFor('AKC')]}
        rows={SHOW_ROWS}
        entries={[flagged('e1', 'dog-1'), flagged('e2', 'dog-2')]}
        entriesTrusted={false}
      />
    );
    expect(screen.queryByText(/flagged as pulled/)).not.toBeInTheDocument();
    unmount();

    renderList(SHOW_ROWS, [trialFor('AKC')], [flagged('e1', 'dog-1', 'scratched')]);
    expect(screen.queryByText(/flagged as pulled/)).not.toBeInTheDocument();
  });
});
