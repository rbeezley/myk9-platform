/**
 * The UKC Nosework timer buttons (MYK9-1501): one row in the shared timer card.
 * Dual mode (search + element clocks) pauses and resumes the search clock; single
 * mode starts, stops and resumes the one clock. Timer logic stays in the sheet;
 * this only picks which button to show.
 */

import React from 'react';
import { Button, cn } from '@myk9/ui';
import { timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import type { ElementTimerReturn, StopwatchReturn } from '../../../types';

const startClass = cn(timerPrimaryButtonClass, 'bg-green-600 hover:bg-green-700');

export interface UKCTimerControlsProps {
  isDual: boolean;
  isStarted: boolean;
  isBothStopped: boolean;
  stopwatch: StopwatchReturn;
  elementTimer: ElementTimerReturn;
  onStart: () => void;
  onStop: () => void;
  onPauseSearch: () => void;
  onResumeSearch: () => void;
}

export const UKCTimerControls: React.FC<UKCTimerControlsProps> = ({
  isDual,
  isStarted,
  isBothStopped,
  stopwatch,
  elementTimer,
  onStart,
  onStop,
  onPauseSearch,
  onResumeSearch,
}) => {
  if (isDual) {
    if (!isStarted) {
      return (
        <Button className={startClass} onClick={onStart} data-testid="timer-start">
          Start
        </Button>
      );
    }
    if (stopwatch.isRunning) {
      return (
        <Button
          variant="secondary"
          className={timerPrimaryButtonClass}
          onClick={onPauseSearch}
          data-testid="timer-pause"
        >
          Pause Search
        </Button>
      );
    }
    if (elementTimer.isRunning) {
      return (
        <Button
          variant="secondary"
          className={timerPrimaryButtonClass}
          onClick={onResumeSearch}
          data-testid="timer-resume"
        >
          Resume Search
        </Button>
      );
    }
    if (isBothStopped) {
      return (
        <Button
          variant="outline"
          className={timerPrimaryButtonClass}
          onClick={() => {
            stopwatch.reset();
            elementTimer.reset();
          }}
        >
          Reset
        </Button>
      );
    }
    return null;
  }

  if (stopwatch.isRunning) {
    return (
      <Button
        variant="destructive"
        className={timerPrimaryButtonClass}
        onClick={onStop}
        data-testid="timer-stop"
      >
        Stop
      </Button>
    );
  }
  if (stopwatch.time > 0 && stopwatch.isTimeExpired()) {
    return (
      <Button variant="outline" className={timerPrimaryButtonClass} onClick={stopwatch.reset}>
        Reset
      </Button>
    );
  }
  if (stopwatch.time > 0) {
    return (
      <Button variant="secondary" className={timerPrimaryButtonClass} onClick={stopwatch.start}>
        Resume
      </Button>
    );
  }
  return (
    <Button className={startClass} onClick={onStart} data-testid="timer-start">
      Start
    </Button>
  );
};
