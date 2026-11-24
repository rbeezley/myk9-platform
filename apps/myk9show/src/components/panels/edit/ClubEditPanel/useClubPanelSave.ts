import { useCallback, useState } from 'react';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import type { Club } from '@/types/club-types';
import type { EditPanelSaveContext } from '../EditPanelWrapper';
import { PanelSaveHandledError } from '../panelSaveErrors';
import { clubEditSchema, formDataToClub, type ClubEditFormData } from './formData';
import { NUMBERS_ONLY_SCHEMA } from './numbersOnlySchema';
import { useClubNumbersDraft } from './useClubNumbersDraft';

interface Options {
  clubId: string;
  mode: 'create' | 'edit';
  onSave?: ((clubData: Partial<Club>, context: EditPanelSaveContext) => Promise<void>) | undefined;
  setActiveTab: (tab: 'basic') => void;
}

/**
 * Edit Club's save: the offline-first club row and the online-only club numbers are two
 * separate writes. The wrapper closes the panel only when this resolves, so a failure in
 * either part keeps it open, and the message says which part saved.
 */
export function useClubPanelSave({ clubId, mode, onSave, setActiveTab }: Options) {
  const numbers = useClubNumbersDraft(clubId, mode === 'edit');
  const { dirty: numbersDirty, validate: validateNumbers, persist: persistNumbers } = numbers;

  // The wrapper's own dirty flag for the club row. Comparing the saved data with the opening
  // data instead would misread schema normalization (a trimmed or parsed URL) as an edit.
  const [clubDirty, setClubDirty] = useState(false);
  const handleDataChange = useCallback((_data: ClubEditFormData, changed: boolean) => {
    setClubDirty(changed);
  }, []);

  // Typed numbers can be saved now; offline they are held back, not blocking the club.
  const numbersPending = numbersDirty && numbers.editable;
  // A numbers-only save leaves the club row alone, so the club's other fields (which a
  // newly requested club may not have filled in) do not have to pass validation first.
  const schema = numbersPending && !clubDirty ? NUMBERS_ONLY_SCHEMA : clubEditSchema;

  // Handle save
  const handleSave = useCallback(
    async (formData: ClubEditFormData, context: EditPanelSaveContext) => {
      logger.debug('ClubEditPanel handleSave - Raw form data:', 'panels', { data: formData });
      // Nothing is written when the numbers cannot be saved as typed.
      if (numbersPending && !validateNumbers()) {
        setActiveTab('basic');
        throw new PanelSaveHandledError();
      }
      const clubChanged = clubDirty || !numbersDirty;
      if (onSave && clubChanged) {
        const clubData = formDataToClub(formData);
        logger.debug('ClubEditPanel handleSave - Converted club data:', 'panels', {
          data: clubData,
        });
        await onSave(clubData, context);
      }
      if (numbersDirty && !numbersPending) {
        notifications.warning(
          'The club number changes were not saved because they need a connection.'
        );
      }
      if (!numbersPending) return;
      try {
        await persistNumbers();
      } catch (err) {
        logger.error('Failed to save club numbers', 'clubs', { clubId }, err as Error);
        // Say which part saved. Throwing keeps the panel open (and reports no success) so the
        // numbers can be retried.
        notifications.error(
          clubChanged
            ? "Club details saved, but the club numbers couldn't be saved. Check your connection and try again."
            : "The club numbers couldn't be saved. Check your connection and try again."
        );
        throw new PanelSaveHandledError();
      }
    },
    [
      onSave,
      numbersDirty,
      numbersPending,
      clubDirty,
      validateNumbers,
      persistNumbers,
      setActiveTab,
      clubId,
    ]
  );

  return { numbers, numbersPending, schema, handleSave, handleDataChange, numbersDirty };
}
