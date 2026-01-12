/**
 * Show Management Data Mappers
 * 
 * NOTE: These mappers need to be updated to match the actual database schema.
 * Currently commented out due to schema mismatches after Supabase type regeneration.
 * 
 * Transform data between database format and application format,
 * handle validation, and provide utility functions for show management data.
 */

// TODO: Update mappers to match actual show_registration table schema
// Current issues: The application expects fields like dog_id, class_id, registration_status
// but the actual show_registration table has different fields

/*

import { logger } from '@/services/LoggingService';
import {
  ShowRegistration,
  Armband,
  CreateShowRegistrationData,
  CreateArmbandData,
  ImportRegistrationData,
  ImportArmbandData,
  ShowConfig,
  ClassConfig,
  REGISTRATION_STATUSES,
  CHECK_IN_STATUSES,
  PAYMENT_STATUSES,
  ARMBAND_TYPES
} from '../../types/show-management';

// Database to App Mappers
export const showRegistrationMappers = {
  // Map database show registration to app format (updated for actual schema)
  fromDatabase(dbRegistration: Record<string, unknown>): ShowRegistration {
    return {
      id: dbRegistration.id as string,
      show_id: dbRegistration.show_id as string,
      person_id: dbRegistration.person_id as string,
      registration_date: dbRegistration.registration_date as string,
      registration_type: dbRegistration.registration_type as string,
      check_in_time: dbRegistration.check_in_time as string || undefined,
      checked_in: dbRegistration.checked_in as boolean || undefined,
      payment_status: dbRegistration.payment_status as string || undefined,
      payment_method: dbRegistration.payment_method as string || undefined,
      payment_reference: dbRegistration.payment_reference as string || undefined,
      total_amount: dbRegistration.total_amount as number || undefined,
      number_of_entries: dbRegistration.number_of_entries as number || undefined,
      special_requests: dbRegistration.special_requests as string || undefined,
      dietary_requirements: dbRegistration.dietary_requirements as string || undefined,
      emergency_contact_name: dbRegistration.emergency_contact_name as string || undefined,
      emergency_contact_phone: dbRegistration.emergency_contact_phone as string || undefined,
      preferred_contact_method: dbRegistration.preferred_contact_method as string || undefined,
      created_at: dbRegistration.created_at as string || undefined,
      updated_at: dbRegistration.updated_at as string || undefined
    };
  },

  // Map app show registration to database format
  toDatabase(registration: CreateShowRegistrationData) {
    return {
      show_id: registration.show_id,
      person_id: registration.person_id,
      dog_id: registration.dog_id,
      class_id: registration.class_id || null,
      registration_number: registration.registration_number || null,
      confirmation_number: registration.confirmation_number || null,
      registration_date: registration.registration_date,
      registration_status: registration.registration_status || 'pending',
      check_in_status: registration.check_in_status || 'not_checked_in',
      check_in_time: registration.check_in_time || null,
      payment_status: registration.payment_status || 'pending',
      payment_amount: registration.payment_amount || null,
      payment_method: registration.payment_method || null,
      payment_date: registration.payment_date || null,
      entry_notes: registration.entry_notes || null,
      special_requirements: registration.special_requirements || null,
      is_active: registration.is_active ?? true
    };
  },

  // Validate show registration data
  validate(data: CreateShowRegistrationData): string[] {
    const errors: string[] = [];

    if (!data.show_id) {
      errors.push('Show ID is required');
    }

    if (!data.person_id) {
      errors.push('Person ID is required');
    }

    if (!data.dog_id) {
      errors.push('Dog ID is required');
    }

    if (!data.registration_date) {
      errors.push('Registration date is required');
    } else {
      const date = new Date(data.registration_date);
      if (isNaN(date.getTime())) {
        errors.push('Invalid registration date format');
      }
    }

    if (data.registration_status && !REGISTRATION_STATUSES.includes(data.registration_status as string)) {
      errors.push('Invalid registration status');
    }

    if (data.check_in_status && !CHECK_IN_STATUSES.includes(data.check_in_status as string)) {
      errors.push('Invalid check-in status');
    }

    if (data.payment_status && !PAYMENT_STATUSES.includes(data.payment_status as string)) {
      errors.push('Invalid payment status');
    }

    if (data.payment_amount !== undefined && data.payment_amount < 0) {
      errors.push('Payment amount cannot be negative');
    }

    if (data.check_in_time) {
      const checkInDate = new Date(data.check_in_time);
      if (isNaN(checkInDate.getTime())) {
        errors.push('Invalid check-in time format');
      }
    }

    if (data.payment_date) {
      const paymentDate = new Date(data.payment_date);
      if (isNaN(paymentDate.getTime())) {
        errors.push('Invalid payment date format');
      }
    }

    return errors;
  },

  // Generate confirmation number
  generateConfirmationNumber(showId: string, registrationNumber?: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const showPrefix = showId.substring(0, 4).toUpperCase();
    const regSuffix = registrationNumber ? `-${registrationNumber}` : '';
    return `${showPrefix}-${timestamp}${regSuffix}`;
  }
};

export const armbandMappers = {
  // Map database armband to app format
  fromDatabase(dbArmband: Record<string, unknown>): Armband {
    return {
      id: dbArmband.id as string,
      show_id: dbArmband.show_id as string,
      class_id: dbArmband.class_id as string || undefined,
      registration_id: dbArmband.registration_id as string || undefined,
      armband_number: dbArmband.armband_number as string,
      armband_type: String(dbArmband.armband_type || 'standard'),
      assignment_status: dbArmband.assignment_status as string || 'unassigned',
      print_status: dbArmband.print_status as string || 'not_printed',
      print_date: dbArmband.print_date as string || undefined,
      assignment_date: dbArmband.assignment_date as string || undefined,
      checked_in: dbArmband.checked_in as boolean || false,
      check_in_time: dbArmband.check_in_time as string || undefined,
      ring_number: dbArmband.ring_number as string || undefined,
      ring_time: dbArmband.ring_time as string || undefined,
      judge_name: dbArmband.judge_name as string || undefined,
      class_name: dbArmband.class_name as string || undefined,
      notes: dbArmband.notes as string || undefined,
      created_at: dbArmband.created_at as string,
      updated_at: dbArmband.updated_at as string
    };
  },

  // Map app armband to database format
  toDatabase(armband: CreateArmbandData) {
    return {
      show_id: armband.show_id,
      class_id: armband.class_id || null,
      registration_id: armband.registration_id || null,
      armband_number: armband.armband_number,
      armband_type: armband.armband_type || 'standard',
      assignment_status: armband.assignment_status || 'unassigned',
      print_status: armband.print_status || 'not_printed',
      print_date: armband.print_date || null,
      assignment_date: armband.assignment_date || null,
      checked_in: armband.checked_in || false,
      check_in_time: armband.check_in_time || null,
      ring_number: armband.ring_number || null,
      ring_time: armband.ring_time || null,
      judge_name: armband.judge_name || null,
      class_name: armband.class_name || null,
      notes: armband.notes || null
    };
  },

  // Validate armband data
  validate(data: CreateArmbandData): string[] {
    const errors: string[] = [];

    if (!data.show_id) {
      errors.push('Show ID is required');
    }

    if (!data.armband_number) {
      errors.push('Armband number is required');
    }

    if (data.armband_type && !ARMBAND_TYPES.includes(data.armband_type as string)) {
      errors.push('Invalid armband type');
    }

    if (data.print_date) {
      const printDate = new Date(data.print_date);
      if (isNaN(printDate.getTime())) {
        errors.push('Invalid print date format');
      }
    }

    if (data.assignment_date) {
      const assignmentDate = new Date(data.assignment_date);
      if (isNaN(assignmentDate.getTime())) {
        errors.push('Invalid assignment date format');
      }
    }

    if (data.check_in_time) {
      const checkInDate = new Date(data.check_in_time);
      if (isNaN(checkInDate.getTime())) {
        errors.push('Invalid check-in time format');
      }
    }

    if (data.ring_time && !this.isValidTime(data.ring_time)) {
      errors.push('Invalid ring time format (use HH:MM)');
    }

    return errors;
  },

  // Helper function to validate time format
  isValidTime(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  },

  // Parse armband number for sorting
  parseArmbandNumber(armbandNumber: string): { numeric: number; text: string } {
    const numericMatch = armbandNumber.match(/(\d+)/);
    const numeric = numericMatch ? parseInt(numericMatch[1], 10) : 0;
    const text = armbandNumber.replace(/\d/g, '');
    
    return { numeric, text };
  },

  // Sort armbands by number (numeric first, then alphanumeric)
  sortArmbandsByNumber(armbands: Armband[]): Armband[] {
    return armbands.sort((a, b) => {
      const parsedA = this.parseArmbandNumber(a.armband_number);
      const parsedB = this.parseArmbandNumber(b.armband_number);
      
      // Compare text portion first
      if (parsedA.text !== parsedB.text) {
        return parsedA.text.localeCompare(parsedB.text);
      }
      
      // Then compare numeric portion
      return parsedA.numeric - parsedB.numeric;
    });
  }
};

// Check-in functionality now handled through show_registrations and armbands tables
// No separate check-in mappers needed

// Import/Export Mappers
export const importMappers = {
  // Convert import data to show registration
  registrationFromImport(importData: ImportRegistrationData, showId: string, personId: string, dogId: string): CreateShowRegistrationData {
    return {
      show_id: showId,
      person_id: personId,
      dog_id: dogId,
      registration_number: importData.registration_number,
      registration_date: importData.registration_date,
      registration_type: 'standard',
      payment_amount: importData.payment_amount,
      entry_notes: importData.source ? `Imported from ${importData.source}` : undefined
    };
  },

  // Convert import data to armband
  armbandFromImport(importData: ImportArmbandData, showId: string): CreateArmbandData {
    return {
      show_id: showId,
      armband_number: importData.armband_number,
      armband_type: importData.armband_type,
      ring_number: importData.ring_number,
      judge_name: importData.judge_name,
      notes: importData.source ? `Imported from ${importData.source}` : undefined
    };
  },

  // Validate registration import data
  validateRegistrationImport(data: ImportRegistrationData): string[] {
    const errors: string[] = [];

    if (!data.show_identifier) {
      errors.push('Show identifier is required');
    }

    if (!data.person_identifier) {
      errors.push('Person identifier is required');
    }

    if (!data.dog_identifier) {
      errors.push('Dog identifier is required');
    }

    if (!data.registration_date) {
      errors.push('Registration date is required');
    }

    return errors;
  },

  validateArmbandImport(data: ImportArmbandData): string[] {
    const errors: string[] = [];

    if (!data.show_identifier) {
      errors.push('Show identifier is required');
    }

    if (!data.armband_number) {
      errors.push('Armband number is required');
    }

    return errors;
  }
};

// Show and Class Configuration
export const showConfigs: Record<string, ShowConfig> = {
  AKC: {
    name: 'American Kennel Club',
    abbreviation: 'AKC',
    registration_types: ['Individual', 'Group', 'Specialty'],
    armband_types: ['standard', 'judging', 'exhibitor'],
    check_in_methods: ['manual', 'qr_code', 'mobile_app'],
    payment_methods: ['credit_card', 'check', 'cash'],
    ring_assignment: 'class-based',
    website: 'https://www.akc.org'
  },
  UKC: {
    name: 'United Kennel Club',
    abbreviation: 'UKC',
    registration_types: ['Individual', 'Match'],
    armband_types: ['standard', 'exhibitor'],
    check_in_methods: ['manual', 'qr_code'],
    payment_methods: ['credit_card', 'check'],
    ring_assignment: 'manual',
    website: 'https://www.ukcdogs.com'
  },
  CUSTOM: {
    name: 'Custom Show',
    abbreviation: 'CUSTOM',
    registration_types: ['Individual', 'Group', 'Fun Match'],
    armband_types: ['standard', 'special', 'emergency'],
    check_in_methods: ['manual', 'qr_code', 'barcode', 'mobile_app'],
    payment_methods: ['credit_card', 'debit_card', 'cash', 'check', 'venmo'],
    ring_assignment: 'automatic'
  }
};

export const classConfigs: Record<string, ClassConfig> = {
  Conformation: {
    name: 'Conformation',
    abbreviation: 'CONF',
    armband_type: 'numeric',
    armband_range_start: 1,
    armband_range_end: 999,
    check_in_required: true,
    ring_assignment: true
  },
  Obedience: {
    name: 'Obedience',
    abbreviation: 'OB',
    armband_type: 'numeric',
    armband_range_start: 1,
    armband_range_end: 200,
    check_in_required: true,
    ring_assignment: true
  },
  Rally: {
    name: 'Rally',
    abbreviation: 'RA',
    armband_type: 'numeric',
    armband_range_start: 1,
    armband_range_end: 100,
    check_in_required: true,
    ring_assignment: true
  },
  Agility: {
    name: 'Agility',
    abbreviation: 'AG',
    armband_type: 'numeric',
    armband_range_start: 1,
    armband_range_end: 500,
    check_in_required: true,
    ring_assignment: true
  }
};

// Utility Functions
export const showManagementUtils = {
  // Get show config
  getShowConfig(showType: string): ShowConfig | undefined {
    return showConfigs[showType];
  },

  // Get class config
  getClassConfig(className: string): ClassConfig | undefined {
    return classConfigs[className];
  },

  // Check if registration is eligible for check-in
  isEligibleForCheckIn(registration: ShowRegistration): boolean {
    return registration.registration_status === 'confirmed' && 
           registration.payment_status === 'paid' &&
           registration.is_active;
  },

  // Check if armband can be assigned
  canAssignArmband(armband: Armband): boolean {
    return armband.assignment_status === 'unassigned' || 
           armband.assignment_status === 'reserved';
  },

  // Generate next armband number
  generateNextArmbandNumber(existingArmbands: Armband[], classConfig?: ClassConfig): string {
    if (!classConfig) {
      const maxNumber = Math.max(
        ...existingArmbands.map(a => {
          const parsed = armbandMappers.parseArmbandNumber(a.armband_number);
          return parsed.numeric;
        }),
        0
      );
      return (maxNumber + 1).toString();
    }

    const start = classConfig.armband_range_start || 1;
    const end = classConfig.armband_range_end || 999;
    
    const usedNumbers = new Set(
      existingArmbands.map(a => armbandMappers.parseArmbandNumber(a.armband_number).numeric)
    );
    
    for (let i = start; i <= end; i++) {
      if (!usedNumbers.has(i)) {
        return i.toString();
      }
    }
    
    // If all numbers in range are used, return next available
    return (end + 1).toString();
  },

  // Calculate registration fee
  calculateRegistrationFee(registrationData: CreateShowRegistrationData, showConfig?: ShowConfig): number {
    // Basic fee calculation - can be enhanced based on show type, class, etc.
    let baseFee = 25.00;
    
    if (showConfig) {
      // Adjust fee based on show configuration
      if (showConfig.abbreviation === 'AKC') {
        baseFee = 30.00;
      } else if (showConfig.abbreviation === 'UKC') {
        baseFee = 25.00;
      }
    }
    
    return baseFee;
  },

  // Format armband display
  formatArmbandDisplay(armband: Armband): string {
    let display = `#${armband.armband_number}`;
    
    if (armband.ring_number) {
      display += ` (Ring ${armband.ring_number})`;
    }
    
    if (armband.ring_time) {
      display += ` at ${armband.ring_time}`;
    }
    
    return display;
  },

  // Sort registrations by check-in priority
  sortRegistrationsByPriority(registrations: ShowRegistration[]): ShowRegistration[] {
    return registrations.sort((a, b) => {
      // Priority order: confirmed paid, confirmed unpaid, pending, others
      const getPriority = (reg: ShowRegistration) => {
        if (reg.registration_status === 'confirmed' && reg.payment_status === 'paid') return 1;
        if (reg.registration_status === 'confirmed') return 2;
        if (reg.registration_status === 'pending') return 3;
        return 4;
      };
      
      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      
      // Secondary sort by registration date
      return a.registration_date.localeCompare(b.registration_date);
    });
  },

  // Get check-in status color
  getCheckInStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'not_checked_in': '#6b7280', // gray
      'checked_in': '#10b981', // green
      'late_arrival': '#f59e0b', // yellow
      'no_show': '#ef4444', // red
      'withdrawn': '#6b7280' // gray
    };
    
    return colors[status] || '#6b7280';
  },

  // Get payment status color
  getPaymentStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'pending': '#f59e0b', // yellow
      'paid': '#10b981', // green
      'partial': '#f59e0b', // yellow
      'refunded': '#6b7280', // gray
      'cancelled': '#ef4444', // red
      'overdue': '#ef4444' // red
    };
    
    return colors[status] || '#6b7280';
  }
};

*/

import { ShowRegistration, Armband, CreateShowRegistrationData, CreateArmbandData } from '../../types/show-management';
import { DbShowRegistration, DbArmband } from '../../types/database-mappings';

// Temporary stub exports to prevent import errors
export const showRegistrationMappers = {
  fromDatabase: (dbRegistration: DbShowRegistration): ShowRegistration => dbRegistration as unknown as ShowRegistration,
  toDatabase: (data: CreateShowRegistrationData): Partial<DbShowRegistration> => data as unknown as Partial<DbShowRegistration>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate: (data: CreateShowRegistrationData): string[] => []
};

export const armbandMappers = {
  fromDatabase: (dbArmband: DbArmband): Armband => dbArmband as unknown as Armband,
  toDatabase: (data: CreateArmbandData): Partial<DbArmband> => data as unknown as Partial<DbArmband>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate: (data: CreateArmbandData): string[] => []
};