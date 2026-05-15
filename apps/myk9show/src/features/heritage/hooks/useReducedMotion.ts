/**
 * Re-export shim. Canonical implementation now lives in
 * `features/_shared/hooks/useReducedMotion.ts` so every premium style
 * (heritage, monogram, banner, magazine, poster, gazette, fieldGuide,
 * headline) can share it without copy-paste. Heritage call sites continue
 * to import from this path.
 */
export { useReducedMotion } from '../../_shared/hooks/useReducedMotion';
