import { describe, expect, it } from 'vitest';
import { buildFinishList } from './finishList';
import { calculateResultsRowsLeft } from './fromResultsRows';
import { readHandlerClashes, type HandlerClashEntry } from './handlerClash';

// MYK9-2031: one handler on two or more live entries in the same class is a clash.
const e = (
  class_id: string | null,
  handler_id: string | null | undefined,
  extra: Partial<HandlerClashEntry> = {}
): HandlerClashEntry => ({ class_id, handler_id, entry_status: 'confirmed', ...extra });

describe('readHandlerClashes', () => {
  it('counts the dogs sharing a handler in one class, and names the class once', () => {
    expect(readHandlerClashes([e('c1', 'p1'), e('c1', 'p1'), e('c1', 'p2')])).toEqual({
      count: 2,
      classIds: ['c1'],
    });
  });

  it('is no clash for the same handler across different classes', () => {
    expect(readHandlerClashes([e('c1', 'p1'), e('c2', 'p1')])).toEqual({ count: 0, classIds: [] });
  });

  it('ignores withdrawn, pulled, moved, deleted and classless entries', () => {
    expect(
      readHandlerClashes([
        e('c1', 'p1'),
        e('c1', 'p1', { entry_status: 'withdrawn' }),
        e('c1', 'p1', { check_in_status: 'pulled' }),
        e('c1', 'p1', { entry_status: 'moved' }),
        e('c1', 'p1', { deleted_at: '2026-11-01T00:00:00Z' }),
        e(null, 'p1'),
        e(null, 'p1'),
      ])
    ).toEqual({ count: 0, classIds: [] });
  });

  it('clears once Change handler names someone else for one dog', () => {
    expect(readHandlerClashes([e('c1', 'p1'), e('c1', 'p2')])).toEqual({ count: 0, classIds: [] });
  });

  it('skips entries with no handler person instead of pairing them', () => {
    expect(readHandlerClashes([e('c1', null), e('c1', null)])).toEqual({ count: 0, classIds: [] });
  });

  it('is unknown, not zero, when a live entry does not carry handler_id', () => {
    expect(readHandlerClashes([e('c1', 'p1'), e('c1', undefined)])).toBeUndefined();
  });

  it('ignores a withdrawn entry that lacks handler_id', () => {
    expect(readHandlerClashes([e('c1', undefined, { entry_status: 'withdrawn' })])).toEqual({
      count: 0,
      classIds: [],
    });
  });
});

describe('Finish the show: handler clash line', () => {
  const items = (handlerClashes: ReturnType<typeof readHandlerClashes>) =>
    buildFinishList(
      'show-1',
      calculateResultsRowsLeft([], [{ id: 't1', registry_id: 'AKC' }], {
        submissions: null,
        handlerClashes,
      })
    );

  it('words the line plainly, links to the classes, and comes before the submission line', () => {
    const list = items({ count: 2, classIds: ['c1', 'c2'] });
    const item = list.find(i => i.key === 'handler-clash');
    expect(item).toMatchObject({
      state: 'open',
      label:
        '2 dogs share a handler in one class. Choose who handles each before printing the marked catalog.',
      href: '/shows/show-1/entries?class=c1%2Cc2',
    });
    expect(item?.label).not.toContain('—');
    const keys = list.map(i => i.key);
    expect(keys.indexOf('handler-clash')).toBeLessThan(
      keys.findIndex(key => key.includes('results-file') || key.includes('submi'))
    );
  });

  it('disappears at zero and when the caller does not look', () => {
    expect(items({ count: 0, classIds: [] }).some(i => i.key === 'handler-clash')).toBe(false);
    expect(items(undefined).some(i => i.key === 'handler-clash')).toBe(false);
  });
});
