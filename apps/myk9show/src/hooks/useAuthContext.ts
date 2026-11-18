import { useContext } from 'react';
import { AuthContext } from '../context/authContextObject';
export { getPrimaryRole } from '../context/authContextHelpers';

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
