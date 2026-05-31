export interface ShowDeskToolStateInput {
  id: string;
  defaultOpen?: boolean;
  attentionLabel?: string;
}

export function getShowDeskToolsStorageKey(showId: string): string {
  return `show-desk-tools:${showId}`;
}

export function buildDefaultOpenToolIds(tools: readonly ShowDeskToolStateInput[]): string[] {
  return tools
    .filter(tool => tool.defaultOpen === true || Boolean(tool.attentionLabel))
    .map(tool => tool.id);
}

export function loadOpenToolIds(
  showId: string,
  tools: readonly ShowDeskToolStateInput[]
): string[] {
  const defaults = buildDefaultOpenToolIds(tools);

  try {
    const raw = window.localStorage.getItem(getShowDeskToolsStorageKey(showId));
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const validIds = new Set(tools.map(tool => tool.id));
    return parsed.filter((id): id is string => typeof id === 'string' && validIds.has(id));
  } catch {
    return defaults;
  }
}

export function saveOpenToolIds(showId: string, openToolIds: readonly string[]): void {
  try {
    window.localStorage.setItem(getShowDeskToolsStorageKey(showId), JSON.stringify([...openToolIds]));
  } catch {
    // Preference persistence is non-critical; the sheet remains usable.
  }
}
