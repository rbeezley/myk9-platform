/**
 * Simple Nationals Counter Component
 *
 * Mobile-friendly counter buttons matching Flutter app design
 */

import React from 'react';
import './shared-scoring.css';

interface CounterProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  label: string;
  type: 'positive' | 'negative';
}

const Counter: React.FC<CounterProps> = ({ value, onIncrement, onDecrement, label, type }) => (
  <div className={`counter-group ${type}`}>
    <div className="counter-label">{label}</div>
    <div className="counter-controls">
      <button
        className="counter-btn decrement"
        onClick={onDecrement}
        disabled={value <= 0}
      >
        −
      </button>
      <div className="counter-value">{value}</div>
      <button
        className="counter-btn increment"
        onClick={onIncrement}
      >
        {type === 'positive' ? '+' : '+'}
      </button>
    </div>
  </div>
);

interface NationalsCounterSimpleProps {
  alertsCorrect: number;
  alertsIncorrect: number;
  faults: number;
  finishCallErrors: number;
  onAlertsCorrectChange: (value: number) => void;
  onAlertsIncorrectChange: (value: number) => void;
  onFaultsChange: (value: number) => void;
  onFinishCallErrorsChange: (value: number) => void;
}

export const NationalsCounterSimple: React.FC<NationalsCounterSimpleProps> = ({
  alertsCorrect,
  alertsIncorrect,
  faults,
  finishCallErrors,
  onAlertsCorrectChange,
  onAlertsIncorrectChange,
  onFaultsChange,
  onFinishCallErrorsChange
}) => {
  return (
    <div className="nationals-counter-simple">
      <div className="counters-grid">
        <Counter
          value={alertsCorrect}
          onIncrement={() => onAlertsCorrectChange(alertsCorrect + 1)}
          onDecrement={() => onAlertsCorrectChange(Math.max(0, alertsCorrect - 1))}
          label="Correct Calls"
          type="positive"
        />
        <Counter
          value={alertsIncorrect}
          onIncrement={() => onAlertsIncorrectChange(alertsIncorrect + 1)}
          onDecrement={() => onAlertsIncorrectChange(Math.max(0, alertsIncorrect - 1))}
          label="Incorrect Calls"
          type="negative"
        />
        <Counter
          value={faults}
          onIncrement={() => onFaultsChange(faults + 1)}
          onDecrement={() => onFaultsChange(Math.max(0, faults - 1))}
          label="Faults"
          type="negative"
        />
        <Counter
          value={finishCallErrors}
          onIncrement={() => onFinishCallErrorsChange(finishCallErrors + 1)}
          onDecrement={() => onFinishCallErrorsChange(Math.max(0, finishCallErrors - 1))}
          label="No Finish Calls"
          type="negative"
        />
      </div>
    </div>
  );
};

export default NationalsCounterSimple;