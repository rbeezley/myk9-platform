/**
 * useAutoTickMarker — remembers that the dog step's selection is the untouched
 * automatic tick of an exhibitor's only dog (MYK9-1795).
 *
 * The tick is a REAL selection in `registrationData` (the step, Next and the
 * price summary read it like any other), but it is not a started entry: while
 * the marker holds, nothing is drafted and no local registration is created.
 * The marker lives here, never in the draft payload.
 *
 * It holds only while nothing else has happened: the same registration data
 * object (any tick, untick or edit replaces it), still on the dog step, no
 * classes and no handler assignments. The first deliberate act latches it off
 * for good, so an untick followed by a re-tick is an ordinary selection.
 */

import { useEffect, useState } from 'react';
import type { RegistrationFormData } from '@/types/show-registration-types';

interface Marker {
  dogId: string;
  /** The registration data the tick produced; null until the tick has landed. */
  baseline: RegistrationFormData | null;
}

export interface AutoTickMarkerInput {
  registrationData: RegistrationFormData;
  currentStepId: string;
  classSelectionCount: number;
  handlerAssignmentCount: number;
}

export function useAutoTickMarker(input: AutoTickMarkerInput) {
  const { registrationData, currentStepId, classSelectionCount, handlerAssignmentCount } = input;
  const [marker, setMarker] = useState<Marker | null>(null);

  const selected = registrationData.selectedDogs;
  const isUntouched =
    marker !== null &&
    currentStepId === 'dog-selection' &&
    classSelectionCount === 0 &&
    handlerAssignmentCount === 0 &&
    (marker.baseline === null
      ? selected.length === 1 && selected[0] === marker.dogId
      : registrationData === marker.baseline);

  useEffect(() => {
    if (!marker) return;
    if (!isUntouched) {
      setMarker(null);
    } else if (marker.baseline === null) {
      setMarker({ dogId: marker.dogId, baseline: registrationData });
    }
  }, [marker, isUntouched, registrationData]);

  return {
    /** The selection is the untouched automatic tick: not a started entry. */
    isPassiveAutoTick: isUntouched,
    markAutoTick: (dogId: string) => setMarker({ dogId, baseline: null }),
  };
}
