import { useContext } from 'react';
import { RegistrationContextProvider } from '../context/RegistrationContext';

export function useRegistrationContext() {
  const context = useContext(RegistrationContextProvider);
  if (context === undefined) {
    throw new Error('useRegistrationContext must be used within a RegistrationProvider');
  }
  return context;
}