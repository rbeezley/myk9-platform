import { useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import type { TrialInput } from '@/store/trialStore';
import type { TrialClass, Trial } from '@/components/trials/types/trial.types';
import type { ClassTemplate, ClassDefinition } from '@/types/template.types';
import type { ClassInput } from '@/store/class-store-types';

interface UseTrialTemplatesOptions {
  currentTrial: (Trial & { classes?: TrialClass[] }) | undefined;
  updateTrial: (id: string, data: Partial<TrialInput>, userId: string) => void;
  addClass: (classData: ClassInput) => void;
  userId: string;
}

export function useTrialTemplates({
  currentTrial,
  updateTrial,
  addClass,
  userId,
}: UseTrialTemplatesOptions) {
  const handleSaveClassesFromTemplate = useCallback(
    (
      selectedClasses: ClassDefinition[],
      template: ClassTemplate,
      judgeAssignments: Array<{ classId: string; judgeId: string; judgeName: string }> = []
    ) => {
      if (!currentTrial) return;

      const existingClasses = currentTrial.classes || [];

      // Check for duplicates and filter out classes that already exist
      const isClassDuplicate = (classDef: ClassDefinition) => {
        return existingClasses.some(
          existingClass =>
            existingClass.element === classDef.element &&
            existingClass.level === (classDef.level || '') &&
            existingClass.section === (classDef.section || '')
        );
      };

      // Separate new classes from duplicates
      const newClasses = selectedClasses.filter(classDef => !isClassDuplicate(classDef));
      const duplicateClasses = selectedClasses.filter(classDef => isClassDuplicate(classDef));

      // Create class IDs that will be shared between TrialClass and ClassData
      const classIds = newClasses.map((_, index) => `class-${Date.now()}-${index}`);

      // Convert new ClassDefinitions to TrialClasses
      const newTrialClasses: TrialClass[] = newClasses.map((classDef, index) => {
        // Calculate start time for each class (assuming 15-minute intervals starting at 9:00 AM)
        const baseTime = new Date(`${currentTrial.trialDate}T09:00:00`);
        const classStartTime = new Date(
          baseTime.getTime() + (existingClasses.length + index) * 15 * 60 * 1000
        );

        // Find judge assignment for this class
        const judgeAssignment = judgeAssignments.find(ja => ja.classId === classDef.className);
        const judgeId = judgeAssignment?.judgeId || 'TBD';
        const judgeName = judgeAssignment?.judgeName || 'TBD';

        return {
          id: classIds[index],
          element: classDef.element,
          level: classDef.level || '',
          section: classDef.section || '',
          judgeId: judgeId,
          judgeName: judgeName,
          startTime: classStartTime.toISOString(),
          status: 'Upcoming' as const,
          entries: 0,
        };
      });

      // Also add classes to the classStore so they can be viewed in ClassDetailsPage
      const newClassDataItems = newClasses.map((classDef, index) => {
        // Find judge assignment for this class
        const judgeAssignment = judgeAssignments.find(ja => ja.classId === classDef.className);
        const judgeName = judgeAssignment?.judgeName || 'TBD';

        return {
          id: classIds[index],
          trialId: currentTrial.id,
          trial: currentTrial.name || currentTrial.type || 'Trial',
          trialDate: currentTrial.trialDate,
          trialNumber: currentTrial.trialNumber || '',
          classOrder: (existingClasses.length + index + 1).toString(),
          status: 'Scheduled' as const,
          judge: judgeName,
          className: classDef.className,
          classNumber: classDef.classNumber || '',
          element: classDef.element,
          level: classDef.level || '',
          section: classDef.section || '',
          hidesUsed: '',
          distractionsUsed: '',
          itemsUsed: '',
          timeLimit1: '3:00',
          timeLimit2: '',
          timeLimit3: '',
          photoUrl: '',
          entryFee: 30,
          maxEntries: 40,
          requiresJumpHeight: false,
        };
      });

      // Add classes to classStore
      newClassDataItems.forEach(classData => {
        addClass(classData);
      });

      // Add only new classes to current trial
      const updatedTrial = {
        ...currentTrial,
        classes: [...existingClasses, ...newTrialClasses],
      };

      updateTrial(updatedTrial.id, updatedTrial as Partial<TrialInput>, userId);

      // Provide feedback about duplicates
      if (duplicateClasses.length > 0) {
        logger.debug('Skipped duplicate classes', 'trials', {
          count: duplicateClasses.length,
          classes: duplicateClasses.map(cls => `${cls.element} ${cls.level} ${cls.section}`),
        });
      }

      if (newClasses.length > 0) {
        logger.info('Added classes from template', 'trials', {
          count: newClasses.length,
          templateName: template.templateName,
        });
      } else {
        logger.debug('No new classes added - all selected classes already exist', 'trials');
      }
    },
    [currentTrial, updateTrial, addClass, userId]
  );

  return { handleSaveClassesFromTemplate };
}
