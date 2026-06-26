/**
 * Day-of Operations Types
 *
 * Shared interfaces for day-of-show operations:
 * - Day-of entries (walk-in registrations)
 * - Move-up requests
 * - Pull records (show-day pulls — offline-first, no refund state)
 * - Class capacity tracking
 */

export interface DayOfEntry {
  dogId: string;
  showId: string;
  classIds: string[];
  handler: string;
  paymentMethod: 'cash' | 'check' | 'waived';
  jumpHeight?: string;
  notes?: string;
}

export interface DayOfEntryDogOwner {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface DayOfEntryDogResult {
  id: string;
  name: string;
  call_name: string | null;
  breed: string | null;
  owner: DayOfEntryDogOwner | null;
}

export interface CreateDayOfEntryDogInput {
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  dogName: string;
  dogCallName?: string;
  dogBreed?: string;
}

export interface MoveUpRequest {
  id: string;
  fromClassId: string;
  toClassId: string;
  status: 'pending' | 'approved' | 'denied';
  reason?: string;
  created_at: string;
  handler: string | null;
  armband: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
  } | null;
  fromClass: {
    id: string;
    name: string;
    class_number: string | null;
  } | null;
  toClass: {
    id: string;
    name: string;
    class_number: string | null;
    max_entries: number | null;
  } | null;
}

export interface ClassWithCapacity {
  id: string;
  name: string;
  class_number: string | null;
  max_entries: number | null;
  trial_id: string;
  accepted_count: number;
  available_spots: number;
  // Structured class identity — used to constrain move-up targets to the same
  // element and a strictly higher level (see getAvailableMoveUpTargets).
  element: string | null;
  level: string | null;
  section: string | null;
}

export interface PullRecord {
  id: string;
  class_id: string | null;
  trial_id: string | null;
  entry_status: string | null;
  entry_fee: number | null;
  created_at: string | null;
  special_requests: string | null;
  handler: string | null;
  armband: string | null;
  payment_status: string | null;
  updated_at: string | null;
  pull_reason?: string | null;
  pulled_at?: string | null;
  pull_timing: 'before_close' | 'after_close' | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
  } | null;
}
