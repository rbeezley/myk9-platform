import { useEffect, useCallback, useRef } from 'react';

/** A shortcut definition for display and execution */
export interface ShortcutDefinition {
  /** Unique key for this shortcut */
  id: string;
  /** Display label */
  label: string;
  /** Key sequence: single key like "?" or chord like "G D", or modifier combo like "Meta+K" */
  keys: string;
  /** Category for grouping in the overlay */
  category: 'navigation' | 'actions' | 'general';
  /** Callback when triggered */
  action: () => void;
  /** If true, shortcut works even when a modal is open (e.g., Esc) */
  global?: boolean;
}

const CHORD_TIMEOUT_MS = 500;

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function isModalOpen(): boolean {
  // Check for open dialogs (radix/shadcn use [role="dialog"], [data-state="open"])
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/**
 * Parse a shortcut key string into a normalized form.
 * - "Meta+K" → modifier shortcut
 * - "G D" → chord sequence
 * - "?" → single key
 */
function parseKeys(
  keys: string
):
  | { type: 'modifier'; key: string; meta: boolean; ctrl: boolean }
  | { type: 'chord'; sequence: string[] }
  | { type: 'single'; key: string } {
  if (keys.includes('+')) {
    const parts = keys.split('+');
    const key = parts[parts.length - 1].toLowerCase();
    const meta = parts.some(p => p === 'Meta');
    const ctrl = parts.some(p => p === 'Ctrl');
    return { type: 'modifier', key, meta, ctrl };
  }
  if (keys.includes(' ')) {
    return { type: 'chord', sequence: keys.split(' ').map(k => k.toLowerCase()) };
  }
  return { type: 'single', key: keys };
}

/**
 * Central keyboard shortcuts hook.
 * Handles single keys, modifier combos, and chord sequences (e.g., G then D).
 * Suppressed when inputs are focused or modals are open (except global shortcuts).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]) {
  const chordBufferRef = useRef<string[]>([]);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetChord = useCallback(() => {
    chordBufferRef.current = [];
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inputFocused = isInputFocused();
      const modalOpen = isModalOpen();

      for (const shortcut of shortcuts) {
        // Skip non-global shortcuts when input focused or modal open
        if (!shortcut.global && (inputFocused || modalOpen)) continue;

        const parsed = parseKeys(shortcut.keys);

        if (parsed.type === 'modifier') {
          const metaMatch = parsed.meta ? e.metaKey : true;
          const ctrlMatch = parsed.ctrl ? e.ctrlKey : true;
          if (e.key.toLowerCase() === parsed.key && metaMatch && ctrlMatch) {
            e.preventDefault();
            shortcut.action();
            resetChord();
            return;
          }
        }

        if (parsed.type === 'single') {
          // Single key shortcuts: only fire if no modifiers held
          if (e.key === parsed.key && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (inputFocused) continue;
            e.preventDefault();
            shortcut.action();
            resetChord();
            return;
          }
        }
      }

      // Chord handling — skip if input focused or modal open, or if modifier keys held
      if (inputFocused || modalOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      // Only buffer single letter/number keys
      if (key.length !== 1) return;

      chordBufferRef.current.push(key);

      // Reset timer
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
      chordTimerRef.current = setTimeout(resetChord, CHORD_TIMEOUT_MS);

      // Check if buffer matches any chord shortcut
      const buffer = chordBufferRef.current;
      for (const shortcut of shortcuts) {
        const parsed = parseKeys(shortcut.keys);
        if (parsed.type !== 'chord') continue;

        const seq = parsed.sequence;
        // Check if buffer ends with this sequence
        if (buffer.length >= seq.length) {
          const tail = buffer.slice(buffer.length - seq.length);
          if (tail.every((k, i) => k === seq[i])) {
            e.preventDefault();
            shortcut.action();
            resetChord();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, [shortcuts, resetChord]);
}

/** Shortcut definitions for the overlay display (without actions, for static listing) */
export type ShortcutDisplay = Pick<ShortcutDefinition, 'id' | 'label' | 'keys' | 'category'>;

/** Extract display-only info from shortcut definitions */
export function getShortcutDisplays(shortcuts: ShortcutDefinition[]): ShortcutDisplay[] {
  return shortcuts.map(({ id, label, keys, category }) => ({ id, label, keys, category }));
}
