import React from 'react';
import EditClassDialog from '@/components/classes/EditClassDialog';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { ClassData } from '@/components/classes/types/classTypes';
import { TrialClass } from '@/components/trials/types/trial.types';
import { logger } from '@/services/LoggingService';

interface AddClassDialogProps {
  open: boolean;
  onClose: () => void;
  trialId: string;
}

const AddClassDialog: React.FC<AddClassDialogProps> = ({ open, onClose, trialId }) => {
  const { addClass } = useClassStoreCompat();

  // Minimal class template with trialId
  const initialClass: ClassData = {
    id: '',
    trialId,
    trial: '',
    trialDate: '',
    trialNumber: '',
    classOrder: '',
    status: 'Scheduled' as const,
    judge: '',
    element: '',
    level: '',
    section: '',
    hidesUsed: '',
    distractionsUsed: '',
    itemsUsed: '',
    timeLimit1: '',
    timeLimit2: '',
    timeLimit3: '',
    photoUrl: '',
  };

  // Called when form submits
  const handleFormSave = async (dataFromDialog: ClassData | TrialClass) => {
    try {
      // Convert ClassData to ClassInput for the database-compatible addClass method
      const classInput = {
        trialId,
        trial: (dataFromDialog as ClassData).trial || '',
        trialDate: (dataFromDialog as ClassData).trialDate || '',
        trialNumber: (dataFromDialog as ClassData).trialNumber || '',
        classOrder: (dataFromDialog as ClassData).classOrder || '',
        status: (dataFromDialog as ClassData).status || 'Scheduled' as const,
        judge: (dataFromDialog as ClassData).judge || '',
        className: (dataFromDialog as ClassData).className,
        classNumber: (dataFromDialog as ClassData).classNumber,
        element: (dataFromDialog as ClassData).element,
        level: (dataFromDialog as ClassData).level,
        section: (dataFromDialog as ClassData).section,
        entryFee: (dataFromDialog as ClassData).entryFee,
        maxEntries: (dataFromDialog as ClassData).maxEntries,
        requiresJumpHeight: (dataFromDialog as ClassData).requiresJumpHeight,
        customFields: (dataFromDialog as ClassData).customFields,
        hidesUsed: (dataFromDialog as ClassData).hidesUsed,
        distractionsUsed: (dataFromDialog as ClassData).distractionsUsed,
        itemsUsed: (dataFromDialog as ClassData).itemsUsed,
        timeLimit1: (dataFromDialog as ClassData).timeLimit1,
        timeLimit2: (dataFromDialog as ClassData).timeLimit2,
        timeLimit3: (dataFromDialog as ClassData).timeLimit3,
        photoUrl: (dataFromDialog as ClassData).photoUrl,
        templateId: (dataFromDialog as ClassData).templateId,
      };
      
      await addClass(classInput);
      onClose();
    } catch (error) {
      logger.error('Failed to add class:', 'classes', {}, error as Error);
    }
  };

  return (
    <EditClassDialog
      open={open}
      onOpenChange={onClose}
      onSave={handleFormSave}
      classItem={initialClass}
      mode="full"
    />
  );
};

export default AddClassDialog;
