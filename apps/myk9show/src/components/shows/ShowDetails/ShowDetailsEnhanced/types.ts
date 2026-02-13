import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import type { UserRole } from '@/types/auth-types';

export interface ShowDetailsEnhancedProps {
  showData: Show;
  associatedTrials: Trial[];
  onEditShow: () => void;
  onDeleteShow: () => void;
  onRegisterForShow?: () => void;
  onManageEntries?: () => void;
  onViewResults?: () => void;
}

export interface ExhibitorDashboardProps {
  show: Show;
  onRegister: () => void;
}

export interface SecretaryDashboardProps {
  show: Show;
  trials: Trial[];
  onManageEntries: () => void;
}

export interface JudgeDashboardProps {
  show: Show;
  trials: Trial[];
}

export interface RegistrationState {
  canRegister: boolean;
  entriesOpen: boolean;
  entriesClose: boolean;
  isPublished: boolean;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  id?: string;
  isCurrentPage?: boolean;
}

export interface ShowHeaderProps {
  showData: Show;
  primaryRole: UserRole;
  registrationState: RegistrationState;
  onRegisterForShow?: (() => void) | undefined;
  onEditShow: () => void;
  breadcrumbItems: BreadcrumbItem[];
}

export interface OverviewTabProps {
  showData: Show;
  associatedTrials: Trial[];
}

export interface TrialsTabProps {
  trials: Trial[];
}
