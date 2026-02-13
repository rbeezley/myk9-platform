import React from 'react';
import type { EditableValueProps } from './types';

/**
 * Displays a value or a clickable "Add" prompt when empty
 */
const EditableValue: React.FC<EditableValueProps> = ({ value, onEdit, suffix = '', formatFn }) => {
  if (value) {
    const displayValue = formatFn ? formatFn(value) : value;
    return <span className="text-sm font-medium text-foreground">{displayValue}{suffix}</span>;
  }

  return (
    <button
      onClick={onEdit}
      className="text-sm font-medium text-primary/70 hover:text-primary
                 transition-colors cursor-pointer hover:underline"
    >
      Add
    </button>
  );
};

export default EditableValue;
