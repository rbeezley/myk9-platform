/**
 * Show Management System Types
 * 
 * Types for tracking show registrations, armband management, and check-in processes.
 * Supports comprehensive show management with registration status tracking and armband workflows.
 */

// Core Show Registration Types
// Updated to match actual show_registration table schema
export interface ShowRegistration {
  id: string;
  show_id: string;
  person_id: string;
  registration_date: string; // ISO date string
  registration_type: string;
  check_in_time?: string; // ISO datetime string
  checked_in?: boolean;
  payment_status?: string;
  payment_method?: string;
  payment_reference?: string;
  total_amount?: number;
  number_of_entries?: number;
  special_requests?: string;
  dietary_requirements?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  preferred_contact_method?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateShowRegistrationData {
  show_id: string;
  person_id: string;
  registration_date?: string;
  registration_type: string;
  check_in_time?: string;
  checked_in?: boolean;
  payment_status?: string;
  payment_method?: string;
  payment_reference?: string;
  total_amount?: number;
  number_of_entries?: number;
  special_requests?: string;
  dietary_requirements?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  preferred_contact_method?: string;
}

export interface UpdateShowRegistrationData extends Partial<CreateShowRegistrationData> {
  id: string;
}

// Armband Types
export interface Armband {
  id: string;
  show_id: string;
  class_id?: string;
  registration_id?: string;
  armband_number: string;
  armband_type: string;
  assignment_status: string;
  print_status: string;
  print_date?: string; // ISO datetime string
  assignment_date?: string; // ISO datetime string
  checked_in: boolean;
  check_in_time?: string; // ISO datetime string
  ring_number?: string;
  ring_time?: string; // ISO time string
  judge_name?: string;
  class_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateArmbandData {
  show_id: string;
  class_id?: string;
  registration_id?: string;
  armband_number: string;
  armband_type?: string;
  assignment_status?: string;
  print_status?: string;
  print_date?: string;
  assignment_date?: string;
  checked_in?: boolean;
  check_in_time?: string;
  ring_number?: string;
  ring_time?: string;
  judge_name?: string;
  class_name?: string;
  notes?: string;
}

export interface UpdateArmbandData extends Partial<CreateArmbandData> {
  id: string;
}

// Check-in functionality is now handled through show_registrations and armbands tables
// No separate CheckInRecord interface needed

// Show Management Analytics Types
export interface RegistrationSummary {
  total_registrations: number;
  active_registrations: number;
  checked_in_count: number;
  payment_pending_count: number;
  registration_statuses: Record<string, number>;
  payment_statuses: Record<string, number>;
  check_in_rate: number;
  latest_registration?: ShowRegistration;
  registrations_by_class: Record<string, number>;
  registrations_by_status: Record<string, number>;
}

export interface ArmbandSummary {
  total_armbands: number;
  assigned_armbands: number;
  printed_armbands: number;
  checked_in_armbands: number;
  assignment_rate: number;
  print_rate: number;
  check_in_rate: number;
  recent_armbands: Armband[];
  armbands_by_type: Record<string, number>;
  armbands_by_class: Record<string, number>;
}

export interface ShowManagementStats {
  registration_summary: RegistrationSummary;
  armband_summary: ArmbandSummary;
  check_in_trend: {
    hour: string;
    registrations: number;
    checked_in: number;
    armbands_assigned: number;
  }[];
  management_highlights: {
    first_registration?: ShowRegistration;
    latest_check_in?: ShowRegistration;
    most_recent_armband?: Armband;
    peak_check_in_time?: string;
  };
}

// Search and Filter Types
// Updated to match actual show_registration table fields
export interface ShowRegistrationFilters {
  show_id?: string;
  person_id?: string;
  registration_type?: string;
  checked_in?: boolean;
  payment_status?: string;
  registration_date_from?: string;
  registration_date_to?: string;
  payment_method?: string;
}

export interface ArmbandFilters {
  show_id?: string;
  class_id?: string;
  registration_id?: string;
  armband_type?: string;
  assignment_status?: string;
  print_status?: string;
  checked_in?: boolean;
  ring_number?: string;
  judge_name?: string;
  assignment_date_from?: string;
  assignment_date_to?: string;
}

// Check-in filters are now handled through ShowRegistrationFilters and ArmbandFilters

// Management Configuration Types
export interface ShowConfig {
  name: string;
  abbreviation: string;
  registration_types: string[];
  armband_types: string[];
  check_in_methods: string[];
  payment_methods: string[];
  ring_assignment: 'automatic' | 'manual' | 'class-based';
  website?: string;
}

export interface ClassConfig {
  name: string;
  abbreviation: string;
  armband_type: 'numeric' | 'alphanumeric' | 'custom';
  armband_range_start?: number;
  armband_range_end?: number;
  check_in_required: boolean;
  ring_assignment: boolean;
}

// Import/Export Types
export interface ImportRegistrationData {
  show_identifier: string; // Can be name, ID, or external reference
  person_identifier: string; // Can be name, email, or external ID
  dog_identifier: string; // Can be name, registration, or external ID
  class_identifier?: string;
  registration_number?: string;
  registration_date: string;
  payment_amount?: number;
  source: string;
  raw_data?: Record<string, unknown>;
}

export interface ImportArmbandData {
  show_identifier: string;
  armband_number: string;
  armband_type?: string;
  ring_number?: string;
  judge_name?: string;
  class_identifier?: string;
  source: string;
  raw_data?: Record<string, unknown>;
}

export interface ImportSummary {
  total_records: number;
  successful_imports: number;
  failed_imports: number;
  errors: {
    row: number;
    error: string;
    data: Record<string, unknown>;
  }[];
  preview: (ShowRegistration | Armband)[];
}

// Constants
export const REGISTRATION_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'transferred',
  'refunded',
  'waitlisted',
  'expired'
] as const;

export const CHECK_IN_STATUSES = [
  'not_checked_in',
  'checked_in',
  'late_arrival',
  'no_show',
  'withdrawn'
] as const;

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'partial',
  'refunded',
  'cancelled',
  'overdue'
] as const;

export const PAYMENT_METHODS = [
  'credit_card',
  'debit_card',
  'cash',
  'check',
  'paypal',
  'venmo',
  'bank_transfer',
  'other'
] as const;

export const ARMBAND_TYPES = [
  'standard',
  'judging',
  'steward',
  'exhibitor',
  'special',
  'emergency',
  'replacement'
] as const;

export const ASSIGNMENT_STATUSES = [
  'unassigned',
  'assigned',
  'reserved',
  'temporary',
  'cancelled'
] as const;

export const PRINT_STATUSES = [
  'not_printed',
  'printed',
  'reprinted',
  'damaged',
  'lost'
] as const;

export const CHECK_IN_METHODS = [
  'manual',
  'qr_code',
  'barcode',
  'nfc',
  'rfid',
  'mobile_app',
  'online'
] as const;

export const VERIFICATION_STATUSES = [
  'verified',
  'unverified',
  'pending',
  'failed',
  'manual_override'
] as const;

export type RegistrationStatus = typeof REGISTRATION_STATUSES[number];
export type CheckInStatus = typeof CHECK_IN_STATUSES[number];
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export type PaymentMethod = typeof PAYMENT_METHODS[number];
export type ArmbandType = typeof ARMBAND_TYPES[number];
export type AssignmentStatus = typeof ASSIGNMENT_STATUSES[number];
export type PrintStatus = typeof PRINT_STATUSES[number];
export type CheckInMethod = typeof CHECK_IN_METHODS[number];
export type VerificationStatus = typeof VERIFICATION_STATUSES[number];