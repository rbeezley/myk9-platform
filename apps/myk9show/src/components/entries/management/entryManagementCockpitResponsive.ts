// Content width, not viewport width. The manager sidebar leaves roughly
// 1,050px on a common 15-inch/1440px laptop, which is still enough for the
// approved balanced queue + focus layout.
export const ENTRY_COCKPIT_COMPACT_WIDTH = 960;

export interface EntryCockpitResponsiveState {
  measured: boolean;
  compact: boolean;
  detailOpen: boolean;
}

export type EntryCockpitResponsiveAction =
  | { type: 'measure'; contentWidth: number; hasFocusedDetail?: boolean }
  | { type: 'open-detail' }
  | { type: 'close-detail' };

export const initialEntryCockpitResponsiveState: EntryCockpitResponsiveState = {
  measured: false,
  compact: false,
  detailOpen: false,
};

export function entryCockpitResponsiveReducer(
  state: EntryCockpitResponsiveState,
  action: EntryCockpitResponsiveAction
): EntryCockpitResponsiveState {
  if (action.type === 'open-detail') {
    return state.compact ? { ...state, detailOpen: true } : state;
  }
  if (action.type === 'close-detail') {
    return state.detailOpen ? { ...state, detailOpen: false } : state;
  }

  const compact = action.contentWidth < ENTRY_COCKPIT_COMPACT_WIDTH;
  if (!compact) return { measured: true, compact: false, detailOpen: false };
  if (!state.measured) {
    return {
      measured: true,
      compact: true,
      detailOpen: action.hasFocusedDetail === true,
    };
  }
  if (action.hasFocusedDetail && !state.detailOpen) {
    return { measured: true, compact: true, detailOpen: true };
  }
  if (!state.compact) return { measured: true, compact: true, detailOpen: true };
  return { ...state, measured: true, compact: true };
}
