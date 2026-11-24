import { useCallback, useState } from 'react';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import type { Club } from '@/types/club-types';
import type { EditPanelSaveContext } from '../EditPanelWrapper';
import { PanelSaveHandledError } from '../panelSaveErrors';
import { clubEditSchema, formDataToClub, type ClubEditFormData } from './formData';
import { NUMBERS_ONLY_SCHEMA } from './numbersOnlySchema';
import { useClubNumbersDraft } from './useClubNumbersDraft';

export const CLUB_NUMBERS_OFFLINE_MESSAGE =
  'Club numbers need a connection. Reconnect, or undo the number change.';
export const CLUB_DETAILS_SAVE_FAILED_MESSAGE =
  "Club numbers saved. The club details couldn't be saved; try again.";
export const CLUB_NUMBERS_SAVE_FAILED_MESSAGE =
  "The club numbers couldn't be saved. Check your connection and try again.";

interface Options {
  clubId: string;
  mode: 'create' | 'edit';
  onSave?: ((clubData: Partial<Club>, context: EditPanelSaveContext) => Promise<void>) | undefined;
  setActiveTab: (tab: 'basic') => void;
}

/**
 * Edit Club's save, numbers first and all or nothing. When the online-only club numbers
 * changed they are validated and written before anything else; if they cannot be (invalid,
 * offline, or the write fails) nothing is written and the panel keeps the draft open. Only
 * then does the offline-first club row save, exactly as it did before the numbers moved in.
 * When the numbers did not change this is the plain club save.
 */
export function useClubPanelSave({ clubId, mode, onSave, setActiveTab }: Options) {
  const numbers = useClubNumbersDraft(clubId, mode === 'edit');
  const { dirty: numbersDirty, editable, validate, persist } = numbers;

  // The wrapper's own dirty flag for the club row.
  const [clubDirty, setClubDirty] = useState(false);
  const handleDataChange = useCallback((_data: ClubEditFormData, changed: boolean) => {
    setClubDirty(changed);
  }, []);

  // A numbers-only save leaves the club row alone, so the club's other fields (which a newly
  // requested club may not have filled in) do not have to pass validation first.
  const schema = numbersDirty && !clubDirty ? NUMBERS_ONLY_SCHEMA : clubEditSchema;

  const handleSave = useCallback(
    async (formData: ClubEditFormData, context: EditPanelSaveContext) => {
      if (numbersDirty) {
        if (!validate()) {
          setActiveTab('basic');
          throw new PanelSaveHandledError();
        }
        if (!editable) {
          setActiveTab('basic');
          notifications.error(CLUB_NUMBERS_OFFLINE_MESSAGE);
          throw new PanelSaveHandledError();
        }
        try {
          await persist();
        } catch (err) {
          logger.error('Failed to save club numbers', 'clubs', { clubId }, err as Error);
          setActiveTab('basic');
          notifications.error(CLUB_NUMBERS_SAVE_FAILED_MESSAGE);
          throw new PanelSaveHandledError();
        }
      }
      if (onSave && (clubDirty || !numbersDirty)) {
        try {
          await onSave(formDataToClub(formData), context);
        } catch (err) {
          // Without a saved number change this is the plain club save, so the wrapper reports it.
          if (!numbersDirty) throw err;
          // The numbers are already written (and no longer a draft), so say so; a retry is the
          // plain club save.
          logger.error('Failed to save club after numbers', 'clubs', { clubId }, err as Error);
          notifications.error(CLUB_DETAILS_SAVE_FAILED_MESSAGE);
          throw new PanelSaveHandledError();
        }
      }
    },
    [numbersDirty, editable, validate, persist, onSave, clubDirty, setActiveTab, clubId]
  );

  return { numbers, schema, handleSave, handleDataChange };
}
