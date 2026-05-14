/**
 * Types for Day-of Operations Page
 */

export interface Show {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface DayOfOperationEntry {
  id: string;
  class_id: string | null;
  trial_id: string | null;
  entry_status: string | null;
  jump_height: string | null;
  run_order?: number | null;
  handler: string | null;
  armband: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    trial_id?: string;
  } | null;
}

export type PullableEntry = DayOfOperationEntry;

export interface DogSearchResult {
  id: string;
  name: string;
  call_name: string | null;
  breed: string | null;
  owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export type PaymentMethod = 'cash' | 'check' | 'waived';
