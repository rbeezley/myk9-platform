/**
 * Re-export shim. Canonical implementation lives in
 * `features/_shared/hooks/useCountdown.ts` so every premium style shares it
 * without copy-paste. Magazine call sites import from this path.
 */
export { useCountdown, type CountdownValue } from '../../_shared/hooks/useCountdown';
