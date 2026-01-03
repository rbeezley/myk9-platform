/**
 * Reusable Passcode Input Component
 *
 * A 5-digit passcode input with individual character boxes,
 * auto-advance, paste support, and keyboard navigation.
 */

import React, { useRef, useEffect } from 'react';
import './PasscodeInput.css';

interface PasscodeInputProps {
  value: string[];
  onChange: (passcode: string[]) => void;
  onComplete?: (passcode: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export const PasscodeInput: React.FC<PasscodeInputProps> = ({
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  placeholder = 'Enter 5-char passcode'
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount if autoFocus enabled
  useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  const handleInputChange = (index: number, inputValue: string) => {
    // Only allow single character
    if (inputValue.length > 1) {
      inputValue = inputValue.slice(-1);
    }

    const newPasscode = [...value];
    newPasscode[index] = inputValue.toUpperCase();
    onChange(newPasscode);

    // Auto-advance to next input
    if (inputValue && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 5 digits are entered
    if (inputValue && index === 4 && onComplete) {
      const isComplete = newPasscode.every(digit => digit !== '');
      if (isComplete) {
        setTimeout(() => {
          onComplete(newPasscode.join(''));
        }, 150);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Handle backspace
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Handle Enter to submit
    if (e.key === 'Enter' && onComplete) {
      const isComplete = value.every(digit => digit !== '');
      if (isComplete) {
        onComplete(value.join(''));
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').toUpperCase().slice(0, 5);
    const newPasscode = [...value];

    for (let i = 0; i < pastedText.length && i < 5; i++) {
      newPasscode[i] = pastedText[i];
    }

    onChange(newPasscode);

    // Focus last filled input or last input if all filled
    const lastFilledIndex = Math.min(pastedText.length - 1, 4);
    inputRefs.current[lastFilledIndex]?.focus();

    // Auto-submit if complete
    if (pastedText.length === 5 && onComplete) {
      setTimeout(() => {
        onComplete(newPasscode.join(''));
      }, 150);
    }
  };

  const handleReset = () => {
    onChange(['', '', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  return (
    <div className="passcode-input-component">
      <div className="passcode-input-container">
        <div className={`passcode-inputs ${value.every(d => d !== '') ? 'all-filled' : ''}`}>
          {value.map((digit, index) => (
            <div key={index} className="input-wrapper">
              <input
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className={`passcode-input ${error ? 'error' : ''} ${digit ? 'filled' : ''}`}
                disabled={disabled}
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                aria-label={`Passcode digit ${index + 1}`}
              />
              <div className="input-dot" />
            </div>
          ))}
        </div>

        {/* Reset Button */}
        {value.some(digit => digit !== '') && !disabled && (
          <button
            type="button"
            onClick={handleReset}
            className="reset-button"
            aria-label="Clear passcode"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};