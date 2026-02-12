/**
 * Judge Management Data Mappers
 *
 * Transform between database format and application format with validation,
 * organization/discipline configuration, and import/export functionality.
 *
 * DB Schema Notes:
 * - No judge_qualifications table exists; qualifications map to judge_certifications
 * - judge_assignments columns: class_id, confirmed_at, created_at, fee, id, invited_at,
 *   notes, person_id, show_id, status, trial_id, updated_at
 * - judge_certifications columns: certification_date, certification_number, created_at,
 *   expiration_date, id, is_active, level, organization, person_id, sport, updated_at
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
import type {
  DbJudgeAssignment,
  DbJudgeCertification
} from '../../types/database-mappings';

// Database to Application Mappers

/**
 * Map judge_certifications row to JudgeQualification app type.
 * There is no separate judge_qualifications table; certifications serve dual purpose.
 */
export const mapDbJudgeQualificationToApp = (dbCert: DbJudgeCertification): JudgeQualification => {
  return {
    id: dbCert.id,
    person_id: dbCert.person_id,
    organization: dbCert.organization,
    qualification_level: dbCert.level || '',
    disciplines: dbCert.sport ? [dbCert.sport] : [],
    date_obtained: dbCert.certification_date || '',
    ...(dbCert.expiration_date ? { expiration_date: dbCert.expiration_date } : {}),
    ...(dbCert.certification_number ? { approval_number: dbCert.certification_number } : {}),
    is_active: dbCert.is_active ?? true,
    created_at: dbCert.created_at || new Date().toISOString(),
    updated_at: dbCert.updated_at || new Date().toISOString()
  };
};

export const mapDbJudgeAssignmentToApp = (dbAssignment: DbJudgeAssignment): JudgeAssignment => {
  return {
    id: dbAssignment.id,
    judge_id: dbAssignment.person_id,
    assignment_type: 'Regular Class',
    assignment_date: dbAssignment.created_at || new Date().toISOString(),
    ...(dbAssignment.show_id ? { show_id: dbAssignment.show_id } : {}),
    ...(dbAssignment.class_id ? { assigned_classes: [dbAssignment.class_id] } : {}),
    ...(dbAssignment.status ? { assignment_status: dbAssignment.status } : {}),
    ...(dbAssignment.confirmed_at ? { confirmed_at: dbAssignment.confirmed_at } : {}),
    ...(dbAssignment.fee != null ? { compensation_amount: dbAssignment.fee } : {}),
    ...(dbAssignment.notes ? { notes: dbAssignment.notes } : {}),
    created_at: dbAssignment.created_at || new Date().toISOString(),
    updated_at: dbAssignment.updated_at || new Date().toISOString()
  };
};

export const mapDbJudgeCertificationToApp = (dbCert: DbJudgeCertification): JudgeCertification => {
  return {
    id: dbCert.id,
    person_id: dbCert.person_id,
    certification_name: [dbCert.sport, dbCert.level].filter(Boolean).join(' ') || 'Unknown',
    issuing_body: dbCert.organization,
    ...(dbCert.certification_number ? { certification_number: dbCert.certification_number } : {}),
    date_obtained: dbCert.certification_date || '',
    ...(dbCert.expiration_date ? { expiration_date: dbCert.expiration_date } : {}),
    renewal_required: false,
    continuing_education_hours: 0,
    is_active: dbCert.is_active ?? true,
    created_at: dbCert.created_at || new Date().toISOString(),
    updated_at: dbCert.updated_at || new Date().toISOString()
  };
};

// Application to Database Mappers

export const mapAppJudgeQualificationToDb = (qualification: CreateJudgeQualificationData): Omit<DbJudgeCertification, 'id' | 'created_at' | 'updated_at'> => {
  return {
    person_id: qualification.person_id,
    organization: qualification.organization,
    level: qualification.qualification_level || null,
    sport: qualification.disciplines[0] || 'General',
    certification_date: qualification.date_obtained || null,
    expiration_date: qualification.expiration_date || null,
    certification_number: qualification.approval_number || null,
    is_active: qualification.is_active ?? true,
  };
};

export const mapAppJudgeAssignmentToDb = (assignment: CreateJudgeAssignmentData): Omit<DbJudgeAssignment, 'id' | 'created_at' | 'updated_at'> => {
  return {
    person_id: assignment.judge_id,
    show_id: assignment.show_id || null,
    class_id: assignment.assigned_classes?.[0] || null,
    trial_id: null,
    status: assignment.assignment_status || 'Requested',
    fee: assignment.compensation_amount || null,
    confirmed_at: null,
    invited_at: null,
    notes: assignment.notes || null,
  };
};

export const mapAppJudgeCertificationToDb = (certification: CreateJudgeCertificationData): Omit<DbJudgeCertification, 'id' | 'created_at' | 'updated_at'> => {
  return {
    person_id: certification.person_id,
    organization: certification.issuing_body,
    sport: certification.certification_name || 'General',
    level: null,
    certification_number: certification.certification_number || null,
    certification_date: certification.date_obtained || null,
    expiration_date: certification.expiration_date || null,
    is_active: certification.is_active ?? true,
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
    const createData: CreateJudgeQualificationData = {
      person_id: item.judge_identifier,
      organization: item.organization,
      qualification_level: item.qualification_level,
      disciplines: item.disciplines,
      date_obtained: item.date_obtained,
      ...(item.expiration_date ? { expiration_date: item.expiration_date } : {}),
      ...(item.approval_number ? { approval_number: item.approval_number } : {}),
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
    const createData: CreateJudgeAssignmentData = {
      judge_id: item.judge_identifier,
      assignment_type: item.assignment_type,
      assignment_date: item.assignment_date,
      ...(item.show_identifier ? { show_id: item.show_identifier } : {}),
      ...(item.assigned_classes ? { assigned_classes: item.assigned_classes } : {}),
      ...(item.compensation_amount != null ? { compensation_amount: item.compensation_amount } : {}),
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
    const createData: CreateJudgeCertificationData = {
      person_id: item.judge_identifier,
      certification_name: item.certification_name,
      issuing_body: item.issuing_body,
      date_obtained: item.date_obtained,
      ...(item.certification_number ? { certification_number: item.certification_number } : {}),
      ...(item.expiration_date ? { expiration_date: item.expiration_date } : {}),
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
    ...(filtersApplied ? { filters_applied: filtersApplied } : {}),
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
