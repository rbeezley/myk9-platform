export type ViewMode = 'cards' | 'table' | 'calendar' | 'map';

export const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' as const },
  { key: 'map', label: 'Map', icon: 'map' as const },
];

const VALID_VIEW_MODES: ReadonlySet<string> = new Set(VIEW_MODES.map(mode => mode.key));

export function parseViewMode(value: string | null): ViewMode | null {
  return value && VALID_VIEW_MODES.has(value) ? (value as ViewMode) : null;
}
