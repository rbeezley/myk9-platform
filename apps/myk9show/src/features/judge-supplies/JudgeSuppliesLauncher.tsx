import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { JudgeSuppliesSection } from './JudgeSuppliesSection';
import { ManageJudgeSuppliesDialog } from './ManageJudgeSuppliesDialog';
import { useTrialRegistry } from './useTrialRegistry';
import type { JudgeKey } from './types';

interface JudgeSuppliesLauncherProps {
  trialId: string;
  onClose: () => void;
}

/**
 * MYK9-1320: a manager's way to the per-judge supply lists now that the trial page is gone. The
 * existing section lists the trial's judges in a dialog; Edit closes it and opens the existing
 * ManageJudgeSuppliesDialog as a SIBLING, never inside the dialog: the dialog popup is
 * `translate`d, which would make it the containing block of the slide-over's `position: fixed`.
 */
export function JudgeSuppliesLauncher({ trialId, onClose }: JudgeSuppliesLauncherProps) {
  const [judge, setJudge] = useState<JudgeKey | null>(null);
  const registryQuery = useTrialRegistry(trialId);

  return (
    <>
      <Dialog open={judge === null} onOpenChange={open => !open && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>Judge supplies</DialogTitle>
          <DialogDescription>
            The supply list each judge is handed for this trial.
          </DialogDescription>
          <JudgeSuppliesSection trialId={trialId} onEditJudge={setJudge} />
        </DialogContent>
      </Dialog>
      {judge && (
        <ManageJudgeSuppliesDialog
          open
          onOpenChange={open => {
            if (!open) onClose();
          }}
          trialId={trialId}
          judge={judge}
          registryId={registryQuery.data ?? null}
        />
      )}
    </>
  );
}
