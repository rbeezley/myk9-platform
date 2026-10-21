import { useEffect, useRef, useState } from 'react';

interface EmptyEntryReturnArgs {
  currentStepId: string;
  /** Classes across every dog in the entry. */
  entryCount: number;
  /** Step ids in wizard order. */
  stepIds: readonly string[];
  setCurrentStep: (step: number) => void;
  /** Whatever every other way out of Payment resets (the entry agreement), so a
   * person sent back here re-agrees on their next visit, as after Back. */
  onLeavePayment?: () => void;
}

/**
 * INTENT: an entry with no classes is a dead end on Payment ("Total due $0.00"
 * beside a live Submit). When the last class goes away while the person is on
 * Payment, send them back to the Classes step and say why, rather than leaving
 * them to work out that the entry is empty (MYK9-1289).
 *
 * It keys on the count FALLING to zero, not on being zero: a draft restore can
 * mount the wizard on Payment before its selections arrive, and that is not a
 * removal. `proceedBlockedReason` separately keeps Submit disabled at zero.
 *
 * Returns whether the notice should show. The flag is cleared by the same
 * effect that tracks the count, as soon as a class is picked or the person
 * leaves the Classes step, so it never re-announces on a later visit.
 */
export function useEmptyEntryReturn({
  currentStepId,
  entryCount,
  stepIds,
  setCurrentStep,
  onLeavePayment,
}: EmptyEntryReturnArgs): boolean {
  // The notice is derived during render from how the count and step changed
  // (React's "adjust state when a prop changes" pattern), so no effect sets it.
  const [tracked, setTracked] = useState({
    count: entryCount,
    step: currentStepId,
    notice: false,
  });
  if (tracked.count !== entryCount || tracked.step !== currentStepId) {
    const emptiedOnPayment =
      tracked.count > 0 &&
      entryCount === 0 &&
      tracked.step === 'payment' &&
      currentStepId === 'payment';
    let notice = tracked.notice;
    if (emptiedOnPayment) notice = true;
    else if (entryCount > 0 || currentStepId !== 'class-selection') notice = false;
    setTracked({ count: entryCount, step: currentStepId, notice });
  }

  // The redirect changes the parent's step, so it stays in an effect.
  const previousCount = useRef(entryCount);
  useEffect(() => {
    const emptied = previousCount.current > 0 && entryCount === 0;
    previousCount.current = entryCount;
    const classesIndex = stepIds.indexOf('class-selection');
    if (emptied && currentStepId === 'payment' && classesIndex >= 0) {
      onLeavePayment?.();
      setCurrentStep(classesIndex);
    }
  }, [entryCount, currentStepId, stepIds, setCurrentStep, onLeavePayment]);

  return tracked.notice && currentStepId === 'class-selection' && entryCount === 0;
}
