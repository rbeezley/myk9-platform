/**
 * Reusable Passcode Input Component
 *
 * A 5-digit passcode input with individual character boxes,
 * auto-advance, paste support, and keyboard navigation.
 */

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for PasscodeInput */
const styles = {
  component: "w-full",
  container: "relative flex flex-col items-center",
  inputs: cn(
    "flex justify-center mb-[var(--token-space-xl)]",
    "gap-[var(--token-space-md)] sm:gap-[var(--token-space-lg)]"
  ),
  inputsAllFilled: "[&_.passcode-input]:animate-[successPulse_0.4s_ease-out]",
  inputWrapper: "relative",
  input: cn(
    "w-[50px] h-[50px] sm:w-[60px] sm:h-[60px]",
    "border-[var(--token-space-xs)] border-[#d1d5db] rounded-[var(--token-space-lg)]",
    "bg-white text-[var(--foreground)]",
    "text-xl sm:text-2xl font-semibold text-center",
    "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
    "outline-none shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
    "focus:border-[var(--primary)] focus:bg-[#fafafa]",
    "focus:scale-105 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--input)]"
  ),
  inputFilled: "border-[var(--token-success)] bg-[var(--status-qualified-bg)]",
  inputError: cn(
    "border-[var(--token-error)] bg-[var(--status-not-qualified-bg)]",
    "animate-[shake_0.5s_cubic-bezier(0.36,0.07,0.19,0.97)]"
  ),
  inputDot: cn(
    "absolute -bottom-[10px] left-1/2 -translate-x-1/2",
    "w-[7px] h-[7px] rounded-full",
    "bg-[var(--primary)]",
    "opacity-0 transition-all duration-300"
  ),
  inputDotActive: "opacity-100 scale-[1.2]",
  resetButton: cn(
    "bg-white border-[var(--token-space-xs)] border-[var(--border)]",
    "rounded-full w-9 h-9",
    "flex items-center justify-center",
    "text-[var(--muted-foreground)] cursor-pointer",
    "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
    "mt-[var(--token-space-lg)]",
    "hover:bg-[var(--muted)] hover:rotate-90",
    "active:rotate-90 active:scale-95"
  ),
};

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

  const allFilled = value.every(d => d !== '');

  return (
    <div className={styles.component}>
      <div className={styles.container}>
        <div className={cn(styles.inputs, allFilled && styles.inputsAllFilled)}>
          {value.map((digit, index) => (
            <div key={index} className={styles.inputWrapper}>
              <input
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className={cn(
                  "passcode-input",
                  styles.input,
                  error && styles.inputError,
                  digit && styles.inputFilled
                )}
                disabled={disabled}
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                aria-label={`Passcode digit ${index + 1}`}
              />
              <div className={cn(styles.inputDot, digit && styles.inputDotActive)} />
            </div>
          ))}
        </div>

        {/* Reset Button */}
        {value.some(digit => digit !== '') && !disabled && (
          <button
            type="button"
            onClick={handleReset}
            className={styles.resetButton}
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