import { createContext } from 'react';
import type { AuthContextType } from './authContextTypes';

/**
 * The auth context object, apart from its provider (MYK9-2140). A screen that only reads the
 * context imports this, so it does not pull in the provider's dependencies (sign-in, RBAC,
 * replication). `AuthContext.tsx` re-exports it and owns the one real provider.
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
