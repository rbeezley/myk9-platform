/**
 * Re-export shim. Canonical implementation now lives in
 * `features/_shared/hooks/useRevealOnScroll.ts` so every premium style can
 * share it without copy-paste. Heritage call sites continue to import from
 * this path.
 */
export { useRevealOnScroll } from '../../_shared/hooks/useRevealOnScroll';
