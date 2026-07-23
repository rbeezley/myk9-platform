import { describe, expect, it } from 'vitest';
import {
  entryCockpitResponsiveReducer,
  initialEntryCockpitResponsiveState,
} from '../entryManagementCockpitResponsive';

describe('entryCockpitResponsiveReducer', () => {
  it('starts a narrow initial load on the queue and opens detail explicitly', () => {
    const measured = entryCockpitResponsiveReducer(initialEntryCockpitResponsiveState, {
      type: 'measure',
      contentWidth: 800,
    });

    expect(measured).toEqual({ measured: true, compact: true, detailOpen: false });
    expect(entryCockpitResponsiveReducer(measured, { type: 'open-detail' })).toEqual({
      measured: true,
      compact: true,
      detailOpen: true,
    });
  });

  it('reveals a URL-focused registration on a narrow initial load', () => {
    expect(
      entryCockpitResponsiveReducer(initialEntryCockpitResponsiveState, {
        type: 'measure',
        contentWidth: 800,
        hasFocusedDetail: true,
      })
    ).toEqual({ measured: true, compact: true, detailOpen: true });
  });

  it('keeps compact detail closed after the secretary returns to the queue', () => {
    const focused = entryCockpitResponsiveReducer(initialEntryCockpitResponsiveState, {
      type: 'measure',
      contentWidth: 800,
      hasFocusedDetail: true,
    });
    const closed = entryCockpitResponsiveReducer(focused, { type: 'close-detail' });

    expect(
      entryCockpitResponsiveReducer(closed, {
        type: 'measure',
        contentWidth: 820,
        hasFocusedDetail: true,
      })
    ).toEqual({ measured: true, compact: true, detailOpen: false });
  });

  it('returns to the compact queue when URL focus is cleared', () => {
    const focused = entryCockpitResponsiveReducer(initialEntryCockpitResponsiveState, {
      type: 'measure',
      contentWidth: 800,
      hasFocusedDetail: true,
    });

    expect(
      entryCockpitResponsiveReducer(focused, {
        type: 'measure',
        contentWidth: 800,
        hasFocusedDetail: false,
      })
    ).toEqual({ measured: true, compact: true, detailOpen: false });
  });

  it('preserves visible detail when a wide cockpit narrows', () => {
    const wide = entryCockpitResponsiveReducer(initialEntryCockpitResponsiveState, {
      type: 'measure',
      contentWidth: 1366,
    });
    const narrowed = entryCockpitResponsiveReducer(wide, {
      type: 'measure',
      contentWidth: 900,
    });

    expect(wide).toEqual({ measured: true, compact: false, detailOpen: false });
    expect(narrowed).toEqual({ measured: true, compact: true, detailOpen: true });
    expect(entryCockpitResponsiveReducer(narrowed, { type: 'close-detail' })).toEqual({
      measured: true,
      compact: true,
      detailOpen: false,
    });
  });

  it('returns to the two-pane state when the cockpit widens', () => {
    const compactDetail = {
      measured: true,
      compact: true,
      detailOpen: true,
    } as const;

    expect(
      entryCockpitResponsiveReducer(compactDetail, { type: 'measure', contentWidth: 1400 })
    ).toEqual({ measured: true, compact: false, detailOpen: false });
  });
});
