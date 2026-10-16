/** Where `MasterDetailLayout` keeps its dragged pane sizes, and a reader for callers. */

export const LIST_PANEL_IDS = ['list', 'detail'];

// localStorage can throw (private window, blocked site data); a lost layout is only cosmetic.
export const layoutStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

export const layoutKey = (id: string) => `myk9:master-detail:${id}`;

/**
 * The list pane's saved share of the split, as a percentage, or null when nothing is saved (or
 * storage cannot be read). The panels persist sizes as percentages, so a list dragged to 320px
 * in one window is wider in a wider one: callers that reason in pixels must read this, not assume
 * the default. Reads the key `useDefaultLayout` writes (`react-resizable-panels:<id>:<panel ids>`).
 */
export function readSavedListPercent(id: string): number | null {
  const raw = layoutStorage.getItem(
    `react-resizable-panels:${layoutKey(id)}:${LIST_PANEL_IDS.join(':')}`
  );
  if (!raw) return null;
  try {
    const list: unknown = (JSON.parse(raw) as Record<string, unknown>)?.list;
    return typeof list === 'number' && list > 0 && list < 100 ? list : null;
  } catch {
    return null;
  }
}
