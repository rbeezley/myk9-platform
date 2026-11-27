import type { ShowEditFormData } from '@/components/panels/edit/ShowEditPanel.types';

/**
 * MYK9-2280: the non-trial fields of the edge function's `NarrativeShowRow` (what the Show Hours
 * and Trial Information text is built from), each mapped to the Edit show form key that changes
 * it, or null when Edit show cannot change it (dates derive from the trials; venue, city and
 * state are not in the form). Trials save from their own panel, so they are always saved.
 * `premiumNarrativeInputsParity.test.ts` fails when the edge row gains a field named nowhere here.
 */
export const NARRATIVE_SHOW_INPUTS = {
  name: 'name',
  location: 'location',
  start_date: null,
  end_date: null,
  venue_name: null,
  city: null,
  state: null,
} as const satisfies Record<string, keyof ShowEditFormData | null>;

const EDITABLE_FORM_KEYS = Object.values(NARRATIVE_SHOW_INPUTS).filter(
  (key): key is Exclude<typeof key, null> => key !== null
);

/**
 * True when a narrative input that Edit show can change differs from the saved show. Only this
 * allowlist counts: the form's own dirty flag turns true when the editor loads its draft, and an
 * exclusion list misses every premium-tab control added later.
 */
export function hasUnsavedNarrativeInputs(
  saved: ShowEditFormData | undefined,
  current: ShowEditFormData
): boolean {
  if (!saved) return false;
  return EDITABLE_FORM_KEYS.some(key => saved[key] !== current[key]);
}
