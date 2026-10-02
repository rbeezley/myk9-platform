import React, { useCallback, useMemo, useState } from 'react';
import type { z } from 'zod';
import { EditPanelWrapper } from './EditPanelWrapper';
import { savedMessage } from './panelSaveErrors';
import type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';
import { showToFormData, formDataToShowSaveData } from './ShowEditPanel.helpers';
import { showSchemas } from '@/lib/validation';
import { ShowEditForm } from './ShowEditForm';
import { usePanelValidationNavigation } from './usePanelValidationNavigation';
import { locateShowField } from './ShowEditPanel.validationTab';
import { DEFAULT_SHOW_EDIT_TAB, type ShowEditTab } from '@/components/shows/showEditRoutes';
import { useEditingPresence } from '@/features/show-presence/useEditingPresence';
import { EditingBadge } from '@/features/show-presence/EditingBadge';

// Cast needed: Zod's .optional() outputs `T | undefined` in its _output type,
// but exactOptionalPropertyTypes treats `field?: T` as "T when present, absent otherwise".
// The runtime behavior is identical — this just bridges the type-level gap.
const showEditSchema = showSchemas.edit as unknown as z.ZodSchema<ShowEditFormData>;

// Main component. The tab lives in the panel so a failed Save can move to the
// tab holding the first invalid field (MYK9-931). `initialTab` is a one-shot
// instruction: a counter bumped on the closed -> open edge re-seeds it, so a
// reopened panel never keeps the last tab.
export const ShowEditPanel: React.FC<ShowEditPanelProps> = props => {
  const [prevOpen, setPrevOpen] = useState(props.open);
  const [session, setSession] = useState(0);
  if (props.open !== prevOpen) {
    setPrevOpen(props.open);
    if (props.open) setSession(current => current + 1);
  }
  return <ShowEditPanelSession key={session} {...props} />;
};

const ShowEditPanelSession: React.FC<ShowEditPanelProps> = ({
  open,
  onClose,
  showId,
  showName,
  initialShowData,
  initialTab,
  onSave,
  onDelete,
  enableAutoSave = false,
}) => {
  // Phase 3 soft edit-awareness: advertise that this user has the show's edit
  // surface open — but ONLY while the panel is open (closed → undefined clears the
  // advisory). Rides the show presence channel; a clean no-op outside a
  // ShowPresenceProvider (e.g. when this panel is reused in ClubDetails).
  useEditingPresence('show', open ? showId : undefined);

  const { activeTab, setActiveTab, handleValidationFail } =
    usePanelValidationNavigation<ShowEditTab>(initialTab ?? DEFAULT_SHOW_EDIT_TAB, locateShowField);

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
      onDelete={onDelete}
      successMessage={data => savedMessage(data.name || showName)}
      onValidationFail={handleValidationFail}
    >
      {/* Advisory heads-up if another staff member already has this show open. */}
      <EditingBadge entityType="show" entityId={showId} className="mb-3" />
      <ShowEditForm
        activeTab={activeTab}
        onTabChange={setActiveTab}
        initialStatus={initialShowData?.status}
      />
    </EditPanelWrapper>
  );
};

// Re-export types for external consumers
export type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';

export default ShowEditPanel;
