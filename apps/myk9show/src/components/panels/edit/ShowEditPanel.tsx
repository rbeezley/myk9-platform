import React, { useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';
import { validateShowData, showToFormData, formDataToShow } from './ShowEditPanel.helpers';
import { ShowEditForm } from './ShowEditForm';

// Main component
export const ShowEditPanel: React.FC<ShowEditPanelProps> = ({
  open,
  onClose,
  showName,
  initialShowData,
  onSave,
  enableAutoSave = false,
}) => {
  // Convert show data to form data
  const initialFormData = useMemo(() => showToFormData(initialShowData), [initialShowData]);

  // Handle save
  const handleSave = useCallback(
    async (formData: ShowEditFormData) => {
      const showData = formDataToShow(formData);
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
      validateData={validateShowData}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
    >
      <ShowEditForm />
    </EditPanelWrapper>
  );
};

// Re-export types for external consumers
export type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';

export default ShowEditPanel;
