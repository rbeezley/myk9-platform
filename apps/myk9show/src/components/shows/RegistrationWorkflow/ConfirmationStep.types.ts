import type {
  ClassSelectionData,
  EntryStatus,
  PaymentStatus,
} from '@/types/show-registration-types';
import type { WaitlistEntryResult } from '@/stores/cartStore';

export interface ConfirmationStepProps {
  registrationNumber?: string | undefined;
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  documents: File[];
  paymentMethod: string;
  paymentStatus?: PaymentStatus | undefined;
  entryStatus?: EntryStatus | undefined;
  totalFees: number;
  showId: string;
  armbandAssignments?: ArmbandAssignment[] | undefined;
  handlers?: HandlerAssignment[] | undefined;
  /** Waitlist entries created during this checkout (full classes) */
  waitlistEntries?: WaitlistEntryResult[] | undefined;
  /** Count of confirmed entries (non-waitlisted) */
  confirmedEntryCount?: number | undefined;
  onDownloadReceipt?: (() => void) | undefined;
  onSendEmail?: (() => void) | undefined;
  onStatusChange?: ((dogId: string, status: EntryStatus) => void) | undefined;
  onArmbandAssign?: ((dogId: string, armband: string) => void) | undefined;
  onNotificationToggle?: ((type: string, enabled: boolean) => void) | undefined;
}

export interface ArmbandAssignment {
  dogId: string;
  armband: string;
  ring?: string | undefined;
}

export interface HandlerAssignment {
  dogId: string;
  handlerName: string;
  isOwner: boolean;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  statusChanges: boolean;
  paymentReceipts: boolean;
  remindersBefore: number;
  ringCallReminders: boolean;
  scheduleChanges: boolean;
}

export interface DogClassDetails {
  className: string;
  classNumber: string;
  trialName: string;
  jumpHeight?: string | undefined;
}
