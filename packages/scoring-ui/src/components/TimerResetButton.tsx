/**
 * TimerResetButton — a labelled reset under the main Start/Stop button
 * (MYK9-1086).
 *
 * Replaces the unlabelled grey icon tucked in the timer card's corner, which
 * judges missed or mistook for something else. It only renders when there is
 * a stopped time to clear, so it is never in reach while the dog is searching.
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@myk9/ui';

export const TimerResetButton: React.FC<{ visible: boolean; onReset: () => void }> = ({
  visible,
  onReset,
}) => {
  if (!visible) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-3 h-12 gap-2 rounded-full px-6 text-base font-semibold"
      onClick={onReset}
      data-testid="timer-reset"
    >
      <RotateCcw className="h-5 w-5" aria-hidden="true" />
      Reset timer
    </Button>
  );
};
