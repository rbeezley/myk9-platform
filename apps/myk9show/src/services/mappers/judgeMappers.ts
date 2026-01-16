/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Fix type errors after judge tables schema update (judge_assignments, judge_certifications column mismatches)
/**
 * Judge Management Data Mappers
 *
 * Transform between database format and application format with validation,
 * organization/discipline configuration, and import/export functionality.
 */

import {
  JudgeQualification,
  JudgeAssignment,
  JudgeCertification,
  CreateJudgeQualificationData,
  CreateJudgeAssignmentData,
  CreateJudgeCertificationData,
  ImportJudgeQualificationData,
  ImportJudgeAssignmentData,
  ImportJudgeCertificationData,
  ExportJudgeData,
  JudgeOrganizationConfig,
  JudgeDisciplineConfig,
  JUDGE_ORGANIZATIONS,
  JUDGE_DISCIPLINES,
  JUDGE_QUALIFICATION_LEVELS,
  ASSIGNMENT_TYPES,
  ASSIGNMENT_STATUSES
} from '../../types/judge-management';
import {
  DbJudgeQualification,
  DbJudgeAssignment,
  DbJudgeCertification
} from '../../types/database-mappings';

// Database to Application Mappers
export const mapDbJudgeQualificationToApp = (dbQualification: DbJudgeQualification): JudgeQualification => {
  return {
    id: dbQualification.id,
    person_id: dbQualification.person_id || '',
    organization: dbQualification.organization,
    qualification_level: dbQualification.qualification_level,
    disciplines: dbQualification.disciplines || [],
    date_obtained: dbQualification.date_obtained,
    expiration_date: dbQualification.expiration_date || undefined,
    approval_number: dbQualification.approval_number || undefined,
    approved_by: dbQualification.approved_by || undefined,
    is_active: dbQualification.is_active ?? true,
    suspension_date: dbQualification.suspension_date || undefined,
    suspension_reason: dbQualification.suspension_reason || undefined,
    notes: dbQualification.notes || undefined,
    created_at: dbQualification.created_at || new Date().toISOString(),
    updated_at: dbQualification.updated_at || new Date().toISOString()
  };
};

export const mapDbJudgeAssignmentToApp = (dbAssignment: DbJudgeAssignment): JudgeAssignment => {
  return {
    id: dbAssignment.id,
    judge_id: dbAssignment.judge_id || '',
    show_id: dbAssignment.show_id || undefined,
    assignment_type: dbAssignment.assignment_type,
    assignment_date: dbAssignment.assignment_date,
    assigned_classes: dbAssignment.assigned_classes || undefined,
    assigned_rings: dbAssignment.assigned_rings || undefined,
    assignment_status: dbAssignment.assignment_status || 'Requested',
    confirmed_at: dbAssignment.confirmed_at || undefined,
    confirmed_by: dbAssignment.confirmed_by || undefined,
    compensation_amount: dbAssignment.compensation_amount ? Number(dbAssignment.compensation_amount) : undefined,
    travel_provided: dbAssignment.travel_provided ?? false,
    expenses_covered: dbAssignment.expenses_covered ?? false,
    special_requirements: dbAssignment.special_requirements || undefined,
    notes: dbAssignment.notes || undefined,
    created_at: dbAssignment.created_at || new Date().toISOString(),
    updated_at: dbAssignment.updated_at || new Date().toISOString()
  };
};

export const mapDbJudgeCertificationToApp = (dbCertification: DbJudgeCertification): JudgeCertification => {
  return {
    id: dbCertification.id,
    person_id: dbCertification.person_id || '',
    certification_name: dbCertification.certification_name,
    issuing_body: dbCertification.issuing_body,
    certification_number: dbCertification.certification_number || undefined,
    date_obtained: dbCertification.date_obtained,
    expiration_date: dbCertification.expiration_date || undefined,
    renewal_required: dbCertification.renewal_required ?? false,
    next_renewal_date: dbCertification.next_renewal_date || undefined,
    continuing_education_hours: dbCertification.continuing_education_hours ?? 0,
    is_active: dbCertification.is_active ?? true,
    notes: dbCertification.notes || undefined,
    created_at: dbCertification.created_at || new Date().toISOString(),
    updated_at: dbCertification.updated_at || new Date().toISOString()
  };
};

// Application to Database Mappers
export const mapAppJudgeQualificationToDb = (qualification: CreateJudgeQualificationData): Omit<DbJudgeQualification, 'id' | 'created_at' | 'updated_at'> => {
  return {
    person_id: qualification.person_id,
    organization: qualification.organization,
    qualification_level: qualification.qualification_level,
    disciplines: qualification.disciplines,
    date_obtained: qualification.date_obtained,
    expiration_date: qualification.expiration_date || null,
    approval_number: qualification.approval_number || null,
    approved_by: qualification.approved_by || null,
    is_active: qualification.is_active ?? true,
    suspension_date: null,
    suspension_reason: null,
    notes: qualification.notes || null
  };
};

export const mapAppJudgeAssignmentToDb = (assignment: CreateJudgeAssignmentData): Omit<DbJudgeAssignment, 'id' | 'created_at' | 'updated_at'> => {
  return {
    judge_id: assignment.judge_id,
    show_id: assignment.show_id || null,
    assignment_type: assignment.assignment_type,
    assignment_date: assignment.assignment_date,
    assigned_classes: assignment.assigned_classes || null,
    assigned_rings: assignment.assigned_rings || null,
    assignment_status: assignment.assignment_status || 'Requested',
    confirmed_at: null,
    confirmed_by: null,
    compensation_amount: assignment.compensation_amount || null,
    travel_provided: assignment.travel_provided ?? false,
    expenses_covered: assignment.expenses_covered ?? false,
    special_requirements: assignment.special_requirements || null,
    notes: assignment.notes || null
  };
};

export const mapAppJudgeCertificationToDb = (certification: CreateJudgeCertificationData): Omit<DbJudgeCertification, 'id' | 'created_at' | 'updated_at'> => {
  return {
    person_id: certification.person_id,
    certification_name: certification.certification_name,
    issuing_body: certification.issuing_body,
    certification_number: certification.certification_number || null,
    date_obtained: certification.date_obtained,
    expiration_date: certification.expiration_date || null,
    renewal_required: certification.renewal_required ?? false,
    next_renewal_date: certification.next_renewal_date || null,
    continuing_education_hours: certification.continuing_education_hours ?? 0,
    is_active: certification.is_active ?? true,
    notes: certification.notes || null
  };
};

// Validation Utilities
export const validateJudgeQualification = (data: CreateJudgeQualificationData): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.person_id?.trim()) {
    errors.push('Person ID is required');
  }

  if (!data.organization?.trim()) {
    errors.push('Organization is required');
  } else if (!JUDGE_ORGANIZATIONS.includes(data.organization as (typeof JUDGE_ORGANIZATIONS)[number])) {
    errors.push(`Invalid organization. Must be one of: ${JUDGE_ORGANIZATIONS.join(', ')}`);
  }

  if (!data.qualification_level?.trim()) {
    errors.push('Qualification level is required');
  } else if (!JUDGE_QUALIFICATION_LEVELS.includes(data.qualification_level as (typeof JUDGE_QUALIFICATION_LEVELS)[number])) {
    errors.push(`Invalid qualification level. Must be one of: ${JUDGE_QUALIFICATION_LEVELS.join(', ')}`);
  }

  if (!data.disciplines || data.disciplines.length === 0) {
    errors.push('At least one discipline is required');
  } else {
    const invalidDisciplines = data.disciplines.filter(d => !JUDGE_DISCIPLINES.includes(d as (typeof JUDGE_DISCIPLINES)[number]));
    if (invalidDisciplines.length > 0) {
      errors.push(`Invalid disciplines: ${invalidDisciplines.join(', ')}`);
    }
  }

  if (!data.date_obtained?.trim()) {
    errors.push('Date obtained is required');
  } else {
    const dateObtained = new Date(data.date_obtained);
    if (isNaN(dateObtained.getTime())) {
      errors.push('Invalid date obtained format');
    } else if (dateObtained > new Date()) {
      errors.push('Date obtained cannot be in the future');
    }
  }

  if (data.expiration_date) {
    const expirationDate = new Date(data.expiration_date);
    if (isNaN(expirationDate.getTime())) {
      errors.push('Invalid expiration date format');
    } else if (data.date_obtained && expirationDate <= new Date(data.date_obtained)) {
      errors.push('Expiration date must be after date obtained');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateJudgeAssignment = (data: CreateJudgeAssignmentData): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.judge_id?.trim()) {
    errors.push('Judge ID is required');
  }

  if (!data.assignment_type?.trim()) {
    errors.push('Assignment type is required');
  } else if (!ASSIGNMENT_TYPES.includes(data.assignment_type as (typeof ASSIGNMENT_TYPES)[number])) {
    errors.push(`Invalid assignment type. Must be one of: ${ASSIGNMENT_TYPES.join(', ')}`);
  }

  if (!data.assignment_date?.trim()) {
    errors.push('Assignment date is required');
  } else {
    const assignmentDate = new Date(data.assignment_date);
    if (isNaN(assignmentDate.getTime())) {
      errors.push('Invalid assignment date format');
    }
  }

  if (data.assignment_status && !ASSIGNMENT_STATUSES.includes(data.assignment_status as (typeof ASSIGNMENT_STATUSES)[number])) {
    errors.push(`Invalid assignment status. Must be one of: ${ASSIGNMENT_STATUSES.join(', ')}`);
  }

  if (data.compensation_amount !== undefined && data.compensation_amount < 0) {
    errors.push('Compensation amount cannot be negative');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateJudgeCertification = (data: CreateJudgeCertificationData): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.person_id?.trim()) {
    errors.push('Person ID is required');
  }

  if (!data.certification_name?.trim()) {
    errors.push('Certification name is required');
  }

  if (!data.issuing_body?.trim()) {
    errors.push('Issuing body is required');
  }

  if (!data.date_obtained?.trim()) {
    errors.push('Date obtained is required');
  } else {
    const dateObtained = new Date(data.date_obtained);
    if (isNaN(dateObtained.getTime())) {
      errors.push('Invalid date obtained format');
    } else if (dateObtained > new Date()) {
      errors.push('Date obtained cannot be in the future');
    }
  }

  if (data.expiration_date) {
    const expirationDate = new Date(data.expiration_date);
    if (isNaN(expirationDate.getTime())) {
      errors.push('Invalid expiration date format');
    } else if (data.date_obtained && expirationDate <= new Date(data.date_obtained)) {
      errors.push('Expiration date must be after date obtained');
    }
  }

  if (data.continuing_education_hours !== undefined && data.continuing_education_hours < 0) {
    errors.push('Continuing education hours cannot be negative');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Organization and Discipline Configuration
export const getOrganizationConfig = (organizationCode: string): JudgeOrganizationConfig | null => {
  const configs: Record<string, JudgeOrganizationConfig> = {
    'AKC': {
      name: 'American Kennel Club',
      code: 'AKC',
      qualification_levels: ['Provisional', 'Regular', 'All-Breed'],
      disciplines: ['Conformation', 'Obedience', 'Rally', 'Agility', 'Field Trials', 'Hunt Tests'],
      certification_requirements: {
        minimum_experience_years: 2,
        required_training_hours: 40,
        requires_renewal: true,
        renewal_period_years: 5,
        requires_continuing_education: true
      },
      assignment_types: ['Regular Class', 'Championship', 'Specialty Match'],
      compensation_guidelines: {
        per_class: 25,
        per_day: 200,
        travel_reimbursement: true,
        expense_allowance: true
      }
    },
    'UKC': {
      name: 'United Kennel Club',
      code: 'UKC',
      qualification_levels: ['Provisional', 'Regular', 'All-Breed'],
      disciplines: ['Conformation', 'Obedience', 'Rally', 'Agility'],
      certification_requirements: {
        minimum_experience_years: 2,
        required_training_hours: 30,
        requires_renewal: true,
        renewal_period_years: 3,
        requires_continuing_education: true
      },
      assignment_types: ['Regular Class', 'Championship', 'Premier'],
      compensation_guidelines: {
        per_class: 20,
        per_day: 150,
        travel_reimbursement: true,
        expense_allowance: false
      }
    },
    'NACSW': {
      name: 'National Association of Canine Scent Work',
      code: 'NACSW',
      qualification_levels: ['Certified Scent Work Judge', 'Senior Judge'],
      disciplines: ['Scent Work'],
      certification_requirements: {
        minimum_experience_years: 1,
        required_training_hours: 20,
        requires_renewal: true,
        renewal_period_years: 2,
        requires_continuing_education: true
      },
      assignment_types: ['Trial', 'Workshop'],
      compensation_guidelines: {
        per_day: 300,
        travel_reimbursement: true,
        expense_allowance: true
      }
    }
  };

  return configs[organizationCode] || null;
};

export const getDisciplineConfig = (disciplineName: string): JudgeDisciplineConfig | null => {
  const configs: Record<string, JudgeDisciplineConfig> = {
    'Scent Work': {
      name: 'Scent Work',
      organizations: ['NACSW', 'AKC', 'UKC'],
      required_qualifications: ['Certified Scent Work Judge'],
      typical_assignment_duration: '1 day',
      special_requirements: ['Must understand odor theory', 'Experience with scent detection']
    },
    'Agility': {
      name: 'Agility',
      organizations: ['AKC', 'UKC', 'USDAA', 'NADAC'],
      required_qualifications: ['Agility Judge'],
      typical_assignment_duration: '2 days',
      special_requirements: ['Must understand course design', 'Safety protocols']
    },
    'Conformation': {
      name: 'Conformation',
      organizations: ['AKC', 'UKC'],
      required_qualifications: ['All-Breed Judge', 'Specialty Judge'],
      typical_assignment_duration: '1-2 days',
      special_requirements: ['Breed knowledge', 'AKC Standard interpretation']
    }
  };

  return configs[disciplineName] || null;
};

// Import/Export Utilities
export const importJudgeQualificationData = (importData: ImportJudgeQualificationData[]): {
  valid: CreateJudgeQualificationData[];
  invalid: Array<{ data: ImportJudgeQualificationData; errors: string[] }>;
} => {
  const valid: CreateJudgeQualificationData[] = [];
  const invalid: Array<{ data: ImportJudgeQualificationData; errors: string[] }> = [];

  importData.forEach(item => {
    // Convert import format to create format
    const createData: CreateJudgeQualificationData = {
      person_id: item.judge_identifier, // This would need person lookup in real implementation
      organization: item.organization,
      qualification_level: item.qualification_level,
      disciplines: item.disciplines,
      date_obtained: item.date_obtained,
      expiration_date: item.expiration_date,
      approval_number: item.approval_number
    };

    const validation = validateJudgeQualification(createData);
    if (validation.isValid) {
      valid.push(createData);
    } else {
      invalid.push({ data: item, errors: validation.errors });
    }
  });

  return { valid, invalid };
};

export const importJudgeAssignmentData = (importData: ImportJudgeAssignmentData[]): {
  valid: CreateJudgeAssignmentData[];
  invalid: Array<{ data: ImportJudgeAssignmentData; errors: string[] }>;
} => {
  const valid: CreateJudgeAssignmentData[] = [];
  const invalid: Array<{ data: ImportJudgeAssignmentData; errors: string[] }> = [];

  importData.forEach(item => {
    // Convert import format to create format
    const createData: CreateJudgeAssignmentData = {
      judge_id: item.judge_identifier, // This would need person lookup in real implementation
      show_id: item.show_identifier, // This would need show lookup in real implementation
      assignment_type: item.assignment_type,
      assignment_date: item.assignment_date,
      assigned_classes: item.assigned_classes,
      compensation_amount: item.compensation_amount
    };

    const validation = validateJudgeAssignment(createData);
    if (validation.isValid) {
      valid.push(createData);
    } else {
      invalid.push({ data: item, errors: validation.errors });
    }
  });

  return { valid, invalid };
};

export const importJudgeCertificationData = (importData: ImportJudgeCertificationData[]): {
  valid: CreateJudgeCertificationData[];
  invalid: Array<{ data: ImportJudgeCertificationData; errors: string[] }>;
} => {
  const valid: CreateJudgeCertificationData[] = [];
  const invalid: Array<{ data: ImportJudgeCertificationData; errors: string[] }> = [];

  importData.forEach(item => {
    // Convert import format to create format
    const createData: CreateJudgeCertificationData = {
      person_id: item.judge_identifier, // This would need person lookup in real implementation
      certification_name: item.certification_name,
      issuing_body: item.issuing_body,
      certification_number: item.certification_number,
      date_obtained: item.date_obtained,
      expiration_date: item.expiration_date
    };

    const validation = validateJudgeCertification(createData);
    if (validation.isValid) {
      valid.push(createData);
    } else {
      invalid.push({ data: item, errors: validation.errors });
    }
  });

  return { valid, invalid };
};

export const exportJudgeData = (
  qualifications: JudgeQualification[],
  assignments: JudgeAssignment[],
  certifications: JudgeCertification[],
  exportedBy: string,
  filtersApplied?: Record<string, unknown>
): ExportJudgeData => {
  return {
    qualifications,
    assignments,
    certifications,
    export_date: new Date().toISOString(),
    exported_by: exportedBy,
    filters_applied: filtersApplied
  };
};

// Utility Functions
export const formatCompensation = (amount: number | undefined): string => {
  if (amount === undefined || amount === null) return 'Not specified';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

export const formatDateRange = (startDate: string, endDate?: string): string => {
  const start = new Date(startDate).toLocaleDateString();
  if (!endDate) return start;
  const end = new Date(endDate).toLocaleDateString();
  return `${start} - ${end}`;
};

export const getQualificationStatus = (qualification: JudgeQualification): 'Active' | 'Suspended' | 'Expired' | 'Expiring Soon' => {
  if (qualification.suspension_date) return 'Suspended';
  if (!qualification.is_active) return 'Suspended';
  
  if (qualification.expiration_date) {
    const expirationDate = new Date(qualification.expiration_date);
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    if (expirationDate < now) return 'Expired';
    if (expirationDate <= thirtyDaysFromNow) return 'Expiring Soon';
  }
  
  return 'Active';
};

export const getCertificationStatus = (certification: JudgeCertification): 'Active' | 'Expired' | 'Expiring Soon' | 'Renewal Due' => {
  if (!certification.is_active) return 'Expired';
  
  if (certification.expiration_date) {
    const expirationDate = new Date(certification.expiration_date);
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    if (expirationDate < now) return 'Expired';
    if (expirationDate <= thirtyDaysFromNow) return 'Expiring Soon';
  }
  
  if (certification.renewal_required && certification.next_renewal_date) {
    const renewalDate = new Date(certification.next_renewal_date);
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    if (renewalDate <= thirtyDaysFromNow) return 'Renewal Due';
  }
  
  return 'Active';
};

export const getAssignmentStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    'Requested': '#fbbf24', // yellow
    'Offered': '#60a5fa', // blue
    'Accepted': '#34d399', // green
    'Confirmed': '#10b981', // emerald
    'Completed': '#6b7280', // gray
    'Cancelled': '#f87171', // red
    'Declined': '#f87171' // red
  };
  
  return colors[status] || '#6b7280';
};