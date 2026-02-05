/**
 * Types for Day-of Operations Page
 */

export interface Show {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ScratchableEntry {
  id: string;
  class_id: string;
  status: string;
  check_in_status: string | null;
  jump_height: string | null;
  run_order: number | null;
  entry: {
    id: string;
    handler: string | null;
    armband_number: string | null;
    dog: {
      id: string;
      name: string;
      call_name: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
  } | null;
}

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
