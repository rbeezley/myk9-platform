import { EntryStatus } from '@/types/show-registration-types';

/** Status changes offered by the registration-level Actions menu. */
export const BULK_STATUSES = [EntryStatus.ACCEPTED, EntryStatus.REJECTED] as const;
