/**
 * TimerResetButton — a labelled reset beside the main Start/Resume button
 * (MYK9-1086, MYK9-1501).
 *
 * Replaces the unlabelled grey icon tucked in the timer card's corner, which
 * judges missed or mistook for something else. It only renders when there is
 * a stopped time to clear, so it is never in reach while the dog is searching.
 * It sits beside Resume in the timer card's single controls row.
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, cn } from '@myk9/ui';
import { timerSecondaryButtonClass } from './ScoresheetTimerCard';

export const TimerResetButton: React.FC<{ visible: boolean; onReset: () => void }> = ({
  visible,
  onReset,
}) => {
  if (!visible) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(timerSecondaryButtonClass)}
      onClick={onReset}
      data-testid="timer-reset"
    >
      <RotateCcw className="h-5 w-5" aria-hidden="true" />
      Reset timer
    </Button>
  );
};
