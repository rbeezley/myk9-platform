import type { JudgeCertification, JudgeQualificationDetailed } from '@/types/dog-types';

export interface JudgeFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  judgeNumber: string;
  qualifications: JudgeQualificationDetailed[];
  certifications: JudgeCertification[];
  availability: {
    startDate: Date | null;
    endDate: Date | null;
    blackoutDates: Date[];
    maxShowsPerMonth: number;
    travelRadius: number;
  };
}

export interface ExpandedSections {
  qualifications: boolean;
  certifications: boolean;
  availability: boolean;
}
