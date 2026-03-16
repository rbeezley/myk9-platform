import type { CreateJudgeQualificationData } from '@/types/judge-management';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateJudgeQualification(data: CreateJudgeQualificationData): ValidationResult {
  const errors: string[] = [];

  if (!data.person_id) errors.push('Person ID is required');
  if (!data.organization) errors.push('Organization is required');
  if (!data.qualification_level) errors.push('Qualification level is required');
  if (!data.date_obtained) errors.push('Date obtained is required');
  if (!Array.isArray(data.disciplines) || data.disciplines.length === 0) {
    errors.push('At least one discipline is required');
  }

  return { isValid: errors.length === 0, errors };
}
