/**
 * Pure geometry and reporting for the sticky-chrome click probe (MYK9-543).
 *
 * The e2e helper that uses these lives in `src/test/e2e/registration/wizardChips.ts`
 * and cannot be unit-tested (vitest excludes every path under `e2e/`), so
 * everything here that can be decided without a browser lives in this module
 * instead, with known-answer tests beside it.
 *
 * The history matters: two earlier rounds enumerated the wizard's sticky
 * overlays by hand and computed the uncovered band between them. Both rounds
 * shipped a bug of the same shape — an overlay missing from the list (the
 * Sonner toaster, then the fixed AppHeader) made the helper report "clear" and
 * scroll the target straight into it. The probe no longer enumerates anything:
 * it asks the browser what is at the target's centre. So no band arithmetic
 * survives here, only the scroll schedule and the failure report.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** What `document.elementFromPoint` found at the target's centre. */
export type HitElement = {
  tag: string;
  testId: string | null;
  role: string | null;
  text: string;
  box: Box | null;
};

export type ProbeOutcome = {
  accepted: boolean;
  hit: HitElement | null;
  targetBox: Box | null;
  scrollTop: number;
};

/**
 * Scroll offsets to try, relative to where the target starts, ordered outward
 * in both directions: `[0, +step, -step, +2*step, -2*step, ...]`.
 *
 * Outward-from-here rather than a computed destination: the point of the
 * restructure is that the helper no longer claims to know WHERE the clear
 * region is. It tries the current position first (the desktop fast path, and
 * the common phone case once the row is in view), then walks away from it in
 * both directions until the browser's own hit test accepts.
 */
export function scrollProbeOffsets(step: number, maxSteps: number): number[] {
  if (!Number.isFinite(step) || step <= 0 || maxSteps <= 0) return [0];
  const offsets = [0];
  for (let index = 1; index <= maxSteps; index += 1) {
    offsets.push(index * step, -index * step);
  }
  return offsets;
}

/**
 * The scroll step for a viewport: a TWELFTH of its height, never below 40px.
 *
 * The step has to be smaller than the smallest gap the chrome leaves, or the
 * probe strides over it: at 393x727 the wizard leaves about 193px between its
 * header and a tall entries bar, and a first cut stepping by a third of the
 * viewport (242px) jumped from "behind the header" straight to "behind the
 * entries bar" and reported the row unreachable.
 */
export function probeStepForViewport(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 40;
  return Math.max(40, Math.round(viewportHeight / 12));
}

export function describeBox(box: Box | null): string {
  return box
    ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`
    : 'no box';
}

/** One line naming the element that won the hit test. */
export function describeHitElement(hit: HitElement | null): string {
  if (!hit) return 'nothing (the point is outside the viewport, or the target has no box)';
  const parts = [hit.tag.toLowerCase()];
  if (hit.testId) parts.push(`[data-testid="${hit.testId}"]`);
  if (hit.role) parts.push(`[role="${hit.role}"]`);
  const text = hit.text ? ` "${hit.text}"` : '';
  return `${parts.join('')}${text} [${describeBox(hit.box)}]`;
}

/**
 * The failure report. Names the element that actually won the hit test rather
 * than a list of overlays the helper knew to look for — the whole point being
 * that the interceptor is usually one nobody listed.
 */
export function formatProbeFailure(
  targetDescription: string,
  viewport: { width: number; height: number },
  outcomes: ProbeOutcome[]
): string {
  const last = outcomes.at(-1);
  const blockers = new Set<string>();
  for (const outcome of outcomes) {
    if (!outcome.accepted) blockers.add(describeHitElement(outcome.hit));
  }
  const tried = outcomes.map(outcome => outcome.scrollTop).join(', ');
  const blockerLines = [...blockers].map(line => `  - ${line}`).join('\n');
  return (
    `${targetDescription} is covered at every scroll position tried at ` +
    `${viewport.width}x${viewport.height}.\n` +
    `Target box: ${describeBox(last?.targetBox ?? null)}\n` +
    `Scroll positions tried: ${tried || 'none'}\n` +
    `Element(s) that won the hit test at the target's centre:\n` +
    `${blockerLines || '  - none recorded'}`
  );
}
