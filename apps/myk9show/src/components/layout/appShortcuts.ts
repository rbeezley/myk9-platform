import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';

/**
 * Canonical shortcut vocabulary (task 3.1). Single source of truth for the
 * app's keyboard shortcuts — AppHeader binds these to handlers and registers
 * them with `useKeyboardShortcuts`; `KeyboardShortcutsOverlay` renders them
 * via `getShortcutDisplays`; `CommandPalette` derives its badge strings from
 * the same table by `commandId` so a badge can never drift from a shortcut
 * that isn't actually registered/functional.
 *
 * design.md "Open Questions — resolved": no new shortcuts in this release —
 * exactly what AppHeader already registered (Meta+K, `?`, `G D/P/S/C`,
 * `C D/P/S`).
 */
export type AppShortcutId =
  | 'command-palette'
  | 'shortcuts-overlay'
  | 'go-dogs'
  | 'go-people'
  | 'go-shows'
  | 'go-clubs'
  | 'create-dog'
  | 'create-person'
  | 'create-show';

interface AppShortcutMeta {
  id: AppShortcutId;
  label: string;
  keys: string;
  category: 'navigation' | 'actions' | 'general';
  /** True when the shortcut should fire even while a modal (including the
   * command palette itself) is open. */
  global?: boolean;
  /** The id of the corresponding `CommandAction` in `CommandPalette.tsx`,
   * when one exists — lets the palette look up this shortcut's `keys` by its
   * own command id instead of hardcoding the key string a second time. */
  commandId?: string;
}

/** Pure shortcut metadata — no handlers, so it can be imported by both
 * AppHeader (to bind actions) and CommandPalette (to derive badges) without
 * creating a circular import. */
export const APP_SHORTCUTS: readonly AppShortcutMeta[] = [
  { id: 'command-palette', label: 'Open command palette', keys: 'Meta+K', category: 'general', global: true },
  // `?` fires only when no input is focused and no dialog is open (NOT
  // `global`) — a printable key must never be swallowed while typing. From
  // inside the palette, the footer's "All shortcuts" BUTTON is the path to
  // the overlay (pointer-primary per design.md Decision 5).
  { id: 'shortcuts-overlay', label: 'Show keyboard shortcuts', keys: '?', category: 'general' },
  { id: 'go-dogs', label: 'Go to Dogs', keys: 'G D', category: 'navigation', commandId: 'nav-dogs' },
  { id: 'go-people', label: 'Go to People', keys: 'G P', category: 'navigation', commandId: 'nav-people' },
  { id: 'go-shows', label: 'Go to Shows', keys: 'G S', category: 'navigation', commandId: 'nav-shows' },
  { id: 'go-clubs', label: 'Go to Clubs', keys: 'G C', category: 'navigation', commandId: 'nav-clubs' },
  { id: 'create-dog', label: 'Create Dog', keys: 'C D', category: 'actions', commandId: 'add-dog' },
  { id: 'create-person', label: 'Create Person', keys: 'C P', category: 'actions', commandId: 'add-person' },
  { id: 'create-show', label: 'New Show', keys: 'C S', category: 'actions', commandId: 'add-show' },
];

/** Look up a registered shortcut's key string by the id of the
 * `CommandAction` it corresponds to in the palette. Returns `undefined` for
 * commands with no registered shortcut — callers must not render a badge in
 * that case (every badge shown must be a real, functional shortcut). */
export function getShortcutKeysForCommand(commandId: string): string | undefined {
  return APP_SHORTCUTS.find(s => s.commandId === commandId)?.keys;
}

export interface AppShortcutHandlers {
  openCommandPalette: () => void;
  openShortcutsOverlay: () => void;
  navigate: (path: string) => void;
}

/** Binds the canonical shortcut table to live handlers, producing the
 * `ShortcutDefinition[]` AppHeader registers with `useKeyboardShortcuts`. */
export function buildAppShortcuts(
  { openCommandPalette, openShortcutsOverlay, navigate }: AppShortcutHandlers,
  { isOnboardingRoute }: { isOnboardingRoute: boolean }
): ShortcutDefinition[] {
  if (isOnboardingRoute) return [];

  const actionsById: Record<AppShortcutId, () => void> = {
    'command-palette': openCommandPalette,
    'shortcuts-overlay': openShortcutsOverlay,
    'go-dogs': () => navigate('/dogs'),
    'go-people': () => navigate('/people'),
    'go-shows': () => navigate('/shows'),
    'go-clubs': () => navigate('/clubs'),
    'create-dog': () => navigate('/dogs?add=true'),
    'create-person': () => navigate('/people?add=true'),
    'create-show': () => navigate('/?wizard=true'),
  };

  return APP_SHORTCUTS.map(({ id, label, keys, category, global }) => ({
    id,
    label,
    keys,
    category,
    action: actionsById[id],
    ...(global ? { global: true } : {}),
  }));
}
