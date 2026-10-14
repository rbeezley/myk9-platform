import { describe, expect, it } from 'vitest';
import { makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { buildMyShowActions } from './myShowActions';
import { groupEntriesByShow } from './groupEntriesByShow';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { getContextualStatusMessage } from './myEntriesUtils';
import { SHOW_NOT_PUBLISHED_LABEL } from '@/lib/showNotPublished';
import { format, formatDistanceToNow, isToday, isTomorrow, differenceInDays } from 'date-fns';

/** MYK9-1147: a show the exhibitor cannot read has no date; nothing may invent one. */
function draftRow(id: string, showId: string) {
  return makeRow({
    id,
    showId,
    showName: SHOW_NOT_PUBLISHED_LABEL,
    isShowUnreadable: true,
    showDate: undefined,
    showEndDate: undefined,
    dogId: `dog-${id}`,
    registrationId: null,
  });
}

describe('an undated (unreadable) show', () => {
  it('is never past, so it stays on the upcoming side', () => {
    expect(isPastShowEntry({ showDate: undefined, showEndDate: undefined }, NOW)).toBe(false);
  });

  it('keeps two different draft shows as two groups', () => {
    const groups = groupEntriesByShow(
      toOrders([draftRow('a', 'show-a'), draftRow('b', 'show-b'), draftRow('c', '')])
    );
    expect(groups).toHaveLength(3);
    expect(groups.every(g => g.showDate === undefined && g.isShowUnreadable)).toBe(true);
  });

  it('gives status copy with no countdown, today or tomorrow text and no Invalid Date', () => {
    const { message } = getContextualStatusMessage(
      draftRow('a', 'show-a'),
      formatDistanceToNow,
      format,
      isToday,
      isTomorrow,
      differenceInDays
    );
    expect(message).not.toMatch(/Show (in|is)|NaN|Invalid/);
  });

  it('drops the add-entry, calendar and show-page items, keeps receipts and messaging', () => {
    const ids = buildMyShowActions({
      showId: 'show-a',
      showName: SHOW_NOT_PUBLISHED_LABEL,
      hasEditableOrders: true,
      hasOrders: true,
      isPastShow: false,
      isShowUnreadable: true,
    }).map(a => a.id);
    expect(ids).toEqual(['edit-entry', 'receipts', 'message-show-team']);
  });
});
