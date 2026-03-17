import React, { useCallback, useMemo } from 'react';
import type { z } from 'zod';
import { EditPanelWrapper } from './EditPanelWrapper';
import type { ShowEditPanelProps, ShowEditFormData } from './ShowEditPanel.types';
import { showToFormData, formDataToShow } from './ShowEditPanel.helpers';
import { showSchemas } from '@/lib/validation';
import { ShowEditForm } from './ShowEditForm';

// Cast needed: Zod's .optional() outputs `T | undefined` in its _output type,
// but exactOptionalPropertyTypes treats `field?: T` as "T when present, absent otherwise".
// The runtime behavior is identical — this just bridges the type-level gap.
const showEditSchema = showSchemas.edit as unknown as z.ZodSchema<ShowEditFormData>;

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
      schema={showEditSchema}
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
