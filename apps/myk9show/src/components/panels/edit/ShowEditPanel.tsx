import React, { useCallback, useMemo } from 'react';
import type { z } from 'zod';
import { EditPanelWrapper } from './EditPanelWrapper';
import type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';
import { showToFormData, formDataToShowSaveData, publishGateError } from './ShowEditPanel.helpers';
import { fetchClubStripeAccount } from '@/features/payments/useClubStripeAccount';
import { showSchemas } from '@/lib/validation';
import { ShowEditForm } from './ShowEditForm';
import { useEditingPresence } from '@/features/show-presence/useEditingPresence';
import { EditingBadge } from '@/features/show-presence/EditingBadge';

// Cast needed: Zod's .optional() outputs `T | undefined` in its _output type,
// but exactOptionalPropertyTypes treats `field?: T` as "T when present, absent otherwise".
// The runtime behavior is identical — this just bridges the type-level gap.
const showEditSchema = showSchemas.edit as unknown as z.ZodSchema<ShowEditFormData>;

// Main component
export const ShowEditPanel: React.FC<ShowEditPanelProps> = ({
  open,
  onClose,
  showId,
  showName,
  initialShowData,
  onSave,
  enableAutoSave = false,
}) => {
  // Phase 3 soft edit-awareness: advertise that this user has the show's edit
  // surface open — but ONLY while the panel is open (closed → undefined clears the
  // advisory). Rides the show presence channel; a clean no-op outside a
  // ShowPresenceProvider (e.g. when this panel is reused in ClubDetails).
  useEditingPresence('show', open ? showId : undefined);

  // Convert show data to form data
  const initialFormData = useMemo(() => showToFormData(initialShowData), [initialShowData]);

  // Handle save. Newly publishing runs the Stripe-payouts gate (round-13
  // review — this dropdown was the last ungated shows.status write surface).
  // Fetched imperatively so the check always sees the form's CURRENT clubId.
  // Throwing aborts the save; EditPanelWrapper toasts the message and keeps
  // the panel open.
  const handleSave = useCallback(
    async (formData: ShowEditFormData) => {
      const newlyPublishing =
        formData.status === 'published' && initialShowData?.status !== 'published';
      if (newlyPublishing) {
        let account: { payouts_enabled: boolean } | null = null;
        if (formData.clubId) {
          try {
            account = await fetchClubStripeAccount(formData.clubId);
          } catch {
            throw new Error('Could not check the club’s payment account. Please try again.');
          }
        }
        const gateError = publishGateError(
          initialShowData?.status,
          formData.status,
          formData.clubId,
          account
        );
        if (gateError) {
          throw new Error(gateError);
        }
      }
      const showData = formDataToShowSaveData(formData);
      if (onSave) {
        await onSave(showData);
      }
    },
    [onSave, initialShowData?.status]
  );

  return (
    <EditPanelWrapper<ShowEditFormData>
      open={open}
      onClose={onClose}
      title="Edit Show"
      subtitle={`Editing details for ${showName}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      schema={showEditSchema}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
    >
      {/* Advisory heads-up if another staff member already has this show open. */}
      <EditingBadge entityType="show" entityId={showId} className="mb-3" />
      <ShowEditForm />
    </EditPanelWrapper>
  );
};

// Re-export types for external consumers
export type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';

export default ShowEditPanel;
