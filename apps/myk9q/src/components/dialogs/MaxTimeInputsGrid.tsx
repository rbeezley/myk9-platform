import React, { useRef, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { TimeRange } from './MaxTimeDialog.types';
import { formatTimeInput, validateTime, generateTimePresets, getAreaLabel } from './MaxTimeDialog.utils';

interface MaxTimeInputsGridProps {
  timeRange: TimeRange;
  times: string[];
  errors: string[];
  isOpen: boolean;
  loading: boolean;
  isDictatedTime: boolean;
  validationMessage: string;
  errorMessage: string;
  onTimeChange: (areaIndex: number, value: string) => void;
  onErrorsChange: (errors: string[]) => void;
  onClearMessages: () => void;
}

export const MaxTimeInputsGrid: React.FC<MaxTimeInputsGridProps> = ({
  timeRange,
  times,
  errors,
  isOpen,
  loading,
  isDictatedTime,
  validationMessage,
  errorMessage,
  onTimeChange,
  onErrorsChange,
  onClearMessages,
}) => {
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first input when dialog opens and is not dictated time
  useEffect(() => {
    if (isOpen && !loading && !isDictatedTime && firstInputRef.current) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
        if (firstInputRef.current?.value) {
          firstInputRef.current.setSelectionRange(0, 2);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, loading, isDictatedTime]);

  const handleTimeChange = (areaIndex: number, value: string) => {
    const formatted = formatTimeInput(value);
    onTimeChange(areaIndex, formatted);

    if (validationMessage || errorMessage) {
      onClearMessages();
    }

    const newErrors = [...errors];
    newErrors[areaIndex] = validateTime(formatted, timeRange);
    onErrorsChange(newErrors);
  };

  const handleTimeKeyDown = (areaIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const value = input.value;
    const cursorPos = input.selectionStart || 0;
    const selectionEnd = input.selectionEnd || 0;

    if (e.key === 'Backspace') {
      e.preventDefault();

      if (cursorPos !== selectionEnd) {
        const newValue = value.slice(0, cursorPos) + value.slice(selectionEnd);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(cursorPos, cursorPos), 0);
        return;
      }

      if (cursorPos === 0) {
        handleTimeChange(areaIndex, '');
        return;
      } else if (cursorPos === 3 && value.charAt(2) === ':') {
        const newValue = value.charAt(0) + '0:' + value.slice(3);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(1, 1), 0);
        return;
      } else if (cursorPos <= 2) {
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(Math.max(0, cursorPos - 1), Math.max(0, cursorPos - 1)), 0);
        return;
      } else {
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(Math.max(3, cursorPos - 1), Math.max(3, cursorPos - 1)), 0);
        return;
      }
    }

    if (e.key === 'Delete') {
      e.preventDefault();

      if (cursorPos !== selectionEnd) {
        const newValue = value.slice(0, cursorPos) + value.slice(selectionEnd);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(cursorPos, cursorPos), 0);
        return;
      }

      if (cursorPos >= value.length) {
        return;
      } else if (cursorPos === 2 && value.charAt(2) === ':') {
        const newValue = value.slice(0, 3) + '0' + value.slice(4);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(3, 3), 0);
        return;
      } else {
        const newValue = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(cursorPos, cursorPos), 0);
        return;
      }
    }

    if (e.key === 'ArrowRight' && cursorPos === 2) {
      e.preventDefault();
      input.setSelectionRange(3, 3);
    }
    if (e.key === 'ArrowLeft' && cursorPos === 3) {
      e.preventDefault();
      input.setSelectionRange(2, 2);
    }
  };

  const handleTimeClick = (_areaIndex: number, e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const clickPos = input.selectionStart || 0;

    if (clickPos >= 2) {
      setTimeout(() => input.setSelectionRange(3, 5), 0);
    } else {
      setTimeout(() => input.setSelectionRange(0, 2), 0);
    }
  };

  const presets = generateTimePresets(timeRange);

  return (
    <div className="time-inputs-grid">
      {Array.from({ length: timeRange.areas }, (_, index) => (
        <div key={index} className="time-input-group">
          <div className="time-input-row">
            <label className="time-input-label">
              {getAreaLabel(index, timeRange)}
            </label>
            <div className="time-input-wrapper">
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type="text"
                inputMode="numeric"
                pattern="[0-9:]*"
                className={`time-input ${errors[index] ? 'error' : ''}`}
                placeholder="MM:SS"
                value={times[index]}
                onChange={(e) => handleTimeChange(index, e.target.value)}
                onKeyDown={(e) => handleTimeKeyDown(index, e)}
                onClick={(e) => handleTimeClick(index, e)}
                onFocus={(e) => {
                  setTimeout(() => {
                    if (e.target.value) {
                      e.target.setSelectionRange(0, 2);
                    } else {
                      e.target.select();
                    }
                  }, 0);
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {times[index] && (
                <button
                  type="button"
                  className="clear-time-btn"
                  onClick={() => handleTimeChange(index, '')}
                  aria-label={`Clear ${getAreaLabel(index, timeRange)} time`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="time-presets">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`time-preset-btn ${
                  times[index] === preset ? 'active' : ''
                }`}
                onClick={() => handleTimeChange(index, preset)}
                aria-label={`Set time to ${preset}`}
              >
                {preset}
              </button>
            ))}
          </div>
          {errors[index] && (
            <div className="input-error">
              <AlertCircle className="error-icon" />
              <span>{errors[index]}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
