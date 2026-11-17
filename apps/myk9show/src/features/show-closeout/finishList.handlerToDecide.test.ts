import { describe, expect, it } from 'vitest';
import { buildFinishList } from './finishList';
import { calculateResultsRowsLeft } from './fromResultsRows';
import { readHandlerToDecide } from './handlerToDecide';

// MYK9-2031: the Finish the show list names entries still left as "I'll decide at the show",
// before the results-submission line, and drops the line once none is left.
function keys(handlerToDecide: Parameters<typeof calculateResultsRowsLeft>[2]['handlerToDecide']) {
  return buildFinishList(
    'show-1',
    calculateResultsRowsLeft([], [{ id: 't1', registry_id: 'AKC' }], {
      submissions: null,
      handlerToDecide,
    })
  );
}

describe('Finish the show: handler to decide', () => {
  it('shows the count in plain words and links to the Entries list for those classes', () => {
    const items = keys({ count: 2, classIds: ['c1', 'c2'] });
    const item = items.find(candidate => candidate.key === 'handler-to-decide');
    expect(item).toMatchObject({
      state: 'open',
      label: '2 entries still say "I\'ll decide at the show" for the handler',
      href: '/shows/show-1/entries?class=c1%2Cc2',
      opensClassList: false,
    });
    expect(item?.label).not.toContain('—');
  });

  it('uses the singular for one entry', () => {
    const item = keys({ count: 1, classIds: ['c1'] }).find(i => i.key === 'handler-to-decide');
    expect(item?.label).toBe('1 entry still says "I\'ll decide at the show" for the handler');
  });

  it('comes before the results submission line', () => {
    const order = keys({ count: 1, classIds: ['c1'] }).map(item => item.key);
    expect(order.indexOf('handler-to-decide')).toBeGreaterThan(-1);
    expect(order.indexOf('handler-to-decide')).toBeLessThan(
      order.findIndex(key => key.includes('results-file') || key.includes('submi'))
    );
  });

  it('disappears at zero and when the caller does not look', () => {
    expect(keys({ count: 0, classIds: [] }).some(i => i.key === 'handler-to-decide')).toBe(false);
    expect(keys(undefined).some(i => i.key === 'handler-to-decide')).toBe(false);
  });
});

describe('readHandlerToDecide', () => {
  it('counts only flagged entries that will still run, with their classes once', () => {
    expect(
      readHandlerToDecide([
        { handler_to_decide: true, class_id: 'c1', entry_status: 'confirmed' },
        { handler_to_decide: true, class_id: 'c1', entry_status: 'submitted' },
        { handler_to_decide: true, class_id: 'c2', entry_status: 'withdrawn' },
        {
          handler_to_decide: true,
          class_id: 'c3',
          entry_status: 'confirmed',
          check_in_status: 'pulled',
        },
        { handler_to_decide: false, class_id: 'c4', entry_status: 'confirmed' },
        { class_id: 'c5', entry_status: 'confirmed' },
      ])
    ).toEqual({ count: 2, classIds: ['c1'] });
  });
});
