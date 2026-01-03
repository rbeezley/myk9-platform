import React, { useState } from 'react';
import './shared-dialog.css';
import './NoviceClassDialog.css';

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
      <div className="novice-class-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{clickedClass.element} {clickedClass.level}</h2>

        {showJudgeWarning && (
          <div className="judge-warning">
            <span className="warning-icon">⚠️</span>
            Different judges assigned to sections A & B
          </div>
        )}

        <div className="dialog-options">
          <label className="dialog-option">
            <input
              type="radio"
              name="viewOption"
              value="A"
              checked={selectedOption === 'A'}
              onChange={() => setSelectedOption('A')}
            />
            <span>View Section A only</span>
          </label>

          {pairedClass && (
            <label className="dialog-option">
              <input
                type="radio"
                name="viewOption"
                value="B"
                checked={selectedOption === 'B'}
                onChange={() => setSelectedOption('B')}
              />
              <span>View Section B only</span>
            </label>
          )}

          {pairedClass && (
            <label className="dialog-option">
              <input
                type="radio"
                name="viewOption"
                value="combined"
                checked={selectedOption === 'combined'}
                onChange={() => setSelectedOption('combined')}
              />
              <span>View Combined A & B</span>
            </label>
          )}
        </div>

        <div className="dialog-actions">
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
