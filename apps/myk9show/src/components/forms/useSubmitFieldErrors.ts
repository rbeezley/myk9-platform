import { useState } from 'react';
import { focusFirstFieldControl, type FieldErrorMap } from './fieldErrors';

const NONE: FieldErrorMap = {};

/**
 * Required-field errors for plain submit forms. `errors` is the validator's per-field
 * map for the CURRENT values; nothing shows until the first failed submit, after which each
 * field's callout clears as soon as that field becomes valid. `fail()` returns whether there is
 * anything to fix: when true it marks the submit as failed and focuses and centres the first
 * failing control; when false it does nothing, so a handler can write `if (fail()) return;`.
 */
export function useSubmitFieldErrors(errors: FieldErrorMap): {
  shown: FieldErrorMap;
  fail: () => boolean;
} {
  const [submitted, setSubmitted] = useState(false);
  return {
    shown: submitted ? errors : NONE,
    fail: () => {
      const failing = Object.keys(errors);
      if (failing.length === 0) return false;
      setSubmitted(true);
      focusFirstFieldControl(failing);
      return true;
    },
  };
}
