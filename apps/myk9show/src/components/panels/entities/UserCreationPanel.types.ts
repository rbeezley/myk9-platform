import { UserRole } from '@/types/auth-types';
import { BasePanelProps } from '../types';

export interface PersonFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  role?: UserRole;
}

export interface PersonCreationPanelProps extends BasePanelProps {
  role?: 'chairman' | 'secretary' | 'judge' | 'exhibitor';
  onStateChange?: (state: {
    isLoading: boolean;
    error: string | null;
    isDirty: boolean;
    isValid: boolean;
  }) => void;
  showActions?: boolean; // Controls whether to show action buttons
}
