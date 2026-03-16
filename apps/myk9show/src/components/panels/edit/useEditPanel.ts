import React from 'react';
import { FormValidation } from '@/hooks/useFormValidation';

export interface EditPanelContextValue<T = Record<string, unknown>> {
  // Form validation (present when schema is provided to EditPanelWrapper)
  form?: FormValidation<T> | undefined;

  // Legacy accessors (delegate to form when schema is provided)
  data: T;
  updateData: (updates: Partial<T>) => void;
  setData: (data: T) => void;

  // Existing (unchanged)
  hasChanges: boolean;
  isValid: boolean;
  errors: string[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Context for form data management
export const EditPanelContext = React.createContext<EditPanelContextValue | null>(null);

// Hook to use edit panel context
export const useEditPanel = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(): EditPanelContextValue<T> => {
  const context = React.useContext(EditPanelContext);
  if (!context) {
    throw new Error('useEditPanel must be used within EditPanelWrapper');
  }
  return context as EditPanelContextValue<T>;
};
