/**
 * Sets and removes several URL params in ONE `setSearchParams` call.
 *
 * react-router's functional `setSearchParams` closes over the params of the
 * render that created it, so two setters called in the same handler each clone
 * the same snapshot and the second silently discards the first (MYK9-906,
 * Codex: "Show all" left the status filter set). Every list page's "Show all"
 * that touches more than one URL param goes through here. A `null` value
 * deletes the param.
 */
import type { SetURLSearchParams } from 'react-router-dom';

export function patchSearchParams(
  setSearchParams: SetURLSearchParams,
  patch: Readonly<Record<string, string | null>>
): void {
  setSearchParams(
    previous => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    },
    { replace: true }
  );
}
