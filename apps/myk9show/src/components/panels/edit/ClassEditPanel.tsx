import React from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { ClassData } from '@/components/classes/types/classTypes';
import { z } from 'zod';
import { classSchemas } from '@/lib/validation';
import type { ClassEditPanelProps, ClassEditFormData } from './ClassEditPanel.types';

// Cast schema to match the pre-existing form data interface.
// Needed because exactOptionalPropertyTypes causes structural mismatch
// between Zod's optional field output (T | undefined) and the interface's
// optional property syntax (prop?: T).
const classFullSchema = classSchemas.full as unknown as z.ZodSchema<ClassEditFormData>;
import { classToFormData, formDataToClass } from './ClassEditPanel.helpers';
import { ClassEditForm } from './ClassEditForm';

// Main component
export const ClassEditPanel: React.FC<ClassEditPanelProps> = ({
  open,
  onClose,
  className,
  initialClassData,
  onSave,
  enableAutoSave = false,
  showId,
}) => {
  const initialFormData = classToFormData(initialClassData as Partial<ClassData>);

  const handleSave = async (formData: ClassEditFormData) => {
    const classData = formDataToClass(formData);
    if (onSave) await onSave(classData);
  };

  return (
    <EditPanelWrapper<ClassEditFormData>
      open={open}
      onClose={onClose}
      title="Edit Class"
      subtitle={`Editing details for ${className}`}
      size="xl"
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
      initialData={initialFormData}
      onSave={handleSave}
      schema={classFullSchema}
    >
      <ClassEditForm {...(showId !== undefined && { showId })} />
    </EditPanelWrapper>
  );
};

export default ClassEditPanel;
