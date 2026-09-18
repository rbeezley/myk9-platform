import React, { useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { z } from 'zod';
import { EditPanelWrapper } from './EditPanelWrapper';
import type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';
import { showToFormData, formDataToShowSaveData } from './ShowEditPanel.helpers';
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
  initialTab,
  onSave,
  onRequestDelete,
  enableAutoSave = false,
}) => {
  // Phase 3 soft edit-awareness: advertise that this user has the show's edit
  // surface open — but ONLY while the panel is open (closed → undefined clears the
  // advisory). Rides the show presence channel; a clean no-op outside a
  // ShowPresenceProvider (e.g. when this panel is reused in ClubDetails).
  useEditingPresence('show', open ? showId : undefined);

  // Convert show data to form data
  const initialFormData = useMemo(() => showToFormData(initialShowData), [initialShowData]);

  // Handle save. MYK9-579 round 5: publishing now happens ONLY through the
  // status pill (ShowStatusPill.tsx), which already runs the Stripe-payouts
  // gate and surfaces enforce_show_publish_gate()'s DB-side refusal. The
  // Basic Info tab's Status dropdown never offers "Published" for a
  // non-published show (ShowEditBasicInfoTab.tsx), so this panel's save path
  // cannot itself trigger a draft->published transition and needs no gate of
  // its own.
  const handleSave = useCallback(
    async (formData: ShowEditFormData) => {
      const showData = formDataToShowSaveData(formData);
      if (onSave) {
        await onSave(showData);
      }
    },
    [onSave]
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
      <ShowEditForm
        {...(initialTab ? { initialTab } : {})}
        initialStatus={initialShowData?.status}
      />
      {/* Deleting a show is settings, not a daily action (Richard, 2026-09-17:
          "Delete show is a red destructive row with confirm at the bottom of the
          Show Edit panel, never in the Actions menu"). Below the form, and last,
          so it is never the thing a hurried secretary reaches first; the confirm
          dialog is the caller's existing DeleteShowDialog. */}
      {onRequestDelete && (
        <div className="mt-8 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <h3 className="text-sm font-semibold text-destructive">Delete this show</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Removes the show and everything under it. You will be asked to confirm.
          </p>
          <Button
            type="button"
            variant="destructive"
            size="touch"
            className="mt-3"
            onClick={onRequestDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete show
          </Button>
        </div>
      )}
    </EditPanelWrapper>
  );
};

// Re-export types for external consumers
export type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';

export default ShowEditPanel;
