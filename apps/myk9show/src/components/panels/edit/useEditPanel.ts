import React from 'react';

export interface EditPanelContextValue<T = Record<string, unknown>> {
  data: T;
  updateData: (updates: Partial<T>) => void;
  setData: (data: T) => void;
  hasChanges: boolean;
  isValid: boolean;
  errors: string[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Context for form data management
export const EditPanelContext = React.createContext<EditPanelContextValue | null>(null);

// Hook to use edit panel context
export const useEditPanel = <T extends Record<string, unknown> = Record<string, unknown>>(): EditPanelContextValue<T> => {
  const context = React.useContext(EditPanelContext);
  if (!context) {
    throw new Error('useEditPanel must be used within EditPanelWrapper');
  }
  return context as EditPanelContextValue<T>;
};