import React from 'react';
import { Button } from '@/components/ui/button';
import type { QuickCreateStep } from './QuickCreateFlow.helpers';
import type { QuickCreateFlowState } from './QuickCreateFlow.types';

interface QuickCreateFooterProps {
  flowState: QuickCreateFlowState;
  onStepChange: (step: QuickCreateStep) => void;
  onCancel: () => void;
  onComplete: () => void;
}

/** Back / Cancel / Next for Quick Create's step screens (MYK9-1081). */
export const QuickCreateFooter: React.FC<QuickCreateFooterProps> = ({
  flowState,
  onStepChange,
  onCancel,
  onComplete,
}) => (
  <div className="flex justify-between">
    <div>
      {flowState.step !== 'exhibitor' && (
        <Button
          variant="outline"
          onClick={() => {
            if (flowState.step === 'dogs') {
              onStepChange('exhibitor');
            } else if (flowState.step === 'review') {
              onStepChange('dogs');
            }
          }}
        >
          Back
        </Button>
      )}
    </div>

    <div className="flex gap-3">
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>

      {flowState.step === 'exhibitor' && flowState.exhibitor && (
        <Button onClick={() => onStepChange('dogs')}>Next: Add Dogs</Button>
      )}

      {flowState.step === 'dogs' && flowState.dogs.length > 0 && (
        <Button onClick={() => onStepChange('review')}>Review</Button>
      )}

      {flowState.step === 'review' && <Button onClick={onComplete}>Complete Setup</Button>}
    </div>
  </div>
);
