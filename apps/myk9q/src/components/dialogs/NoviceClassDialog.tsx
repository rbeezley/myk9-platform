import React, { useState } from 'react';
import './shared-dialog.css';
import { cn } from '@/lib/utils';

/** Tailwind styles for NoviceClassDialog */
const styles = {
  dialog: cn(
    "bg-[var(--card)] border border-[var(--border)] rounded-2xl",
    "p-[var(--token-space-3xl)] sm:p-[var(--token-space-4xl)]",
    "w-[90%] max-w-[90%] sm:max-w-[400px]",
    "shadow-[0_var(--token-space-2xl)_60px_rgba(0,0,0,0.3)]"
  ),
  title: cn(
    "m-0 mb-[var(--token-space-3xl)]",
    "text-xl sm:text-2xl font-semibold",
    "text-[var(--foreground)] text-center"
  ),
  judgeWarning: cn(
    "bg-amber-400/10 border border-[var(--warning)] rounded-lg",
    "px-[var(--token-space-xl)] py-[var(--token-space-lg)]",
    "mb-[var(--token-space-3xl)]",
    "flex items-center gap-[var(--token-space-md)]",
    "text-sm text-[var(--warning)]"
  ),
  warningIcon: "text-xl flex-shrink-0",
  options: cn(
    "flex flex-col gap-[var(--token-space-lg)]",
    "mb-[var(--token-space-3xl)]"
  ),
  option: cn(
    "flex items-center gap-[var(--token-space-lg)]",
    "p-[var(--token-space-xl)] sm:p-[var(--token-space-lg)]",
    "border-[var(--token-space-xs)] border-[var(--border)] rounded-xl",
    "bg-white cursor-pointer transition-all duration-200",
    "hover:border-[var(--primary)] hover:bg-[var(--muted)]",
    // Selected state via has: selector
    "has-[input:checked]:border-[var(--primary)]",
    "has-[input:checked]:bg-blue-500/10",
    "has-[input:checked]:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
  ),
  radio: cn(
    "w-5 h-5 cursor-pointer",
    "accent-[var(--primary)]"
  ),
  optionLabel: cn(
    "text-base sm:text-sm font-medium",
    "text-[var(--foreground)]"
  ),
  actions: "flex gap-[var(--token-space-lg)] justify-end",
};

interface ClassInfo {
  id: number;
  element: string;
  level: string;
  section: string;
  judge_name?: string;
}

interface NoviceClassDialogProps {
  clickedClass: ClassInfo;
  pairedClass: ClassInfo | null;
  onSelect: (option: 'A' | 'B' | 'combined') => void;
  onCancel: () => void;
}

export const NoviceClassDialog: React.FC<NoviceClassDialogProps> = ({
  clickedClass,
  pairedClass,
  onSelect,
  onCancel
}) => {
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'combined'>('combined');

  const handleContinue = () => {
    onSelect(selectedOption);
  };

  const showJudgeWarning = pairedClass &&
    clickedClass.judge_name !== pairedClass.judge_name &&
    clickedClass.judge_name && pairedClass.judge_name;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{clickedClass.element} {clickedClass.level}</h2>

        {showJudgeWarning && (
          <div className={styles.judgeWarning}>
            <span className={styles.warningIcon}>⚠️</span>
            Different judges assigned to sections A & B
          </div>
        )}

        <div className={styles.options}>
          <label className={styles.option}>
            <input
              type="radio"
              name="viewOption"
              value="A"
              checked={selectedOption === 'A'}
              onChange={() => setSelectedOption('A')}
              className={styles.radio}
            />
            <span className={styles.optionLabel}>View Section A only</span>
          </label>

          {pairedClass && (
            <label className={styles.option}>
              <input
                type="radio"
                name="viewOption"
                value="B"
                checked={selectedOption === 'B'}
                onChange={() => setSelectedOption('B')}
                className={styles.radio}
              />
              <span className={styles.optionLabel}>View Section B only</span>
            </label>
          )}

          {pairedClass && (
            <label className={styles.option}>
              <input
                type="radio"
                name="viewOption"
                value="combined"
                checked={selectedOption === 'combined'}
                onChange={() => setSelectedOption('combined')}
                className={styles.radio}
              />
              <span className={styles.optionLabel}>View Combined A & B</span>
            </label>
          )}
        </div>

        <div className={styles.actions}>
          <button className="dialog-button cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="dialog-button continue" onClick={handleContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
