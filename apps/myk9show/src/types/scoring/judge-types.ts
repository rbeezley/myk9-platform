/**
 * Judge-specific type definitions for scoring system
 */

// import { UserRole } from '../dog-types';

// ============================================
// Judge Profile Types
// ============================================

/**
 * Complete judge profile
 */
export interface JudgeProfile {
  id: string;
  userId: string; // Link to auth user
  judgeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  photo?: string;
  organizations: JudgeOrganization[];
  qualifications: JudgeQualification[];
  certifications: JudgeCertification[];
  specialties: string[];
  availability: JudgeAvailability;
  preferences: JudgePreferences;
  statistics?: JudgeStatistics;
  status: 'active' | 'inactive' | 'suspended' | 'retired';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Judge organization membership
 */
export interface JudgeOrganization {
  id: string;
  name: 'AKC' | 'UKC' | 'CKC' | 'FCI' | 'Other';
  memberNumber?: string;
  memberSince?: Date;
  status: 'active' | 'inactive';
}

/**
 * Judge qualification for specific disciplines
 */
export interface JudgeQualification {
  id: string;
  organization: string;
  discipline: JudgeDiscipline;
  level: 'provisional' | 'approved' | 'senior' | 'all-rounder';
  breeds?: string[]; // Specific breeds if not all-rounder
  dateObtained: Date;
  expirationDate?: Date;
  status: 'active' | 'expired' | 'suspended';
}

/**
 * Judge certification
 */
export interface JudgeCertification {
  id: string;
  name: string;
  issuingBody: string;
  certificationNumber: string;
  dateObtained: Date;
  expirationDate?: Date;
  documentUrl?: string;
}

/**
 * Judging disciplines
 */
export type JudgeDiscipline = 
  | 'conformation'
  | 'obedience'
  | 'rally'
  | 'agility'
  | 'tracking'
  | 'herding'
  | 'hunting'
  | 'earthdog'
  | 'lure_coursing'
  | 'dock_diving'
  | 'scent_work'
  | 'fast_cat'
  | 'barn_hunt'
  | 'therapy'
  | 'cgc'; // Canine Good Citizen

// ============================================
// Judge Availability Types
// ============================================

/**
 * Judge availability settings
 */
export interface JudgeAvailability {
  status: 'available' | 'limited' | 'unavailable';
  startDate?: Date;
  endDate?: Date;
  blackoutDates: DateRange[];
  maxShowsPerMonth: number;
  maxShowsPerYear?: number;
  travelRadius: number; // Miles/kilometers
  travelWilling: boolean;
  overnightRequired: boolean;
  daysNotice: number; // Minimum days notice required
  preferredDays: DayOfWeek[];
}

/**
 * Date range for availability
 */
export interface DateRange {
  start: Date;
  end: Date;
  reason?: string;
}

/**
 * Day of week
 */
export type DayOfWeek = 
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// ============================================
// Judge Preferences Types
// ============================================

/**
 * Judge preferences for assignments
 */
export interface JudgePreferences {
  disciplines: JudgeDiscipline[];
  breedGroups?: string[];
  favoriteBreeds?: string[];
  avoidBreeds?: string[];
  classTypes: ClassType[];
  maxEntriesPerDay: number;
  maxClassesPerDay: number;
  breakDuration: number; // Minutes between classes
  lunchDuration: number; // Minutes for lunch
  scoringMethod: 'paper' | 'digital' | 'both';
  requiresSteward: boolean;
  stewardPreference?: 'provided' | 'bring_own' | 'no_preference';
  specialRequirements?: string;
}

/**
 * Class types judge is willing to judge
 */
export type ClassType = 
  | 'conformation'
  | 'junior_showmanship'
  | 'obedience'
  | 'rally'
  | 'agility'
  | 'specialty'
  | 'group'
  | 'best_in_show'
  | 'puppy'
  | 'veteran'
  | 'beginner';

// ============================================
// Judge Statistics Types
// ============================================

/**
 * Judge performance statistics
 */
export interface JudgeStatistics {
  totalShows: number;
  totalClasses: number;
  totalEntries: number;
  averageEntriesPerClass: number;
  averageTimePerEntry: number; // Minutes
  completionRate: number; // Percentage
  onTimeRate: number; // Percentage
  lastJudged?: Date;
  ratings?: JudgeRating;
  feedback?: JudgeFeedback[];
}

/**
 * Judge rating from exhibitors
 */
export interface JudgeRating {
  overall: number; // 1-5
  fairness: number;
  consistency: number;
  professionalism: number;
  timeliness: number;
  communication: number;
  totalRatings: number;
}

/**
 * Feedback entry for judge
 */
export interface JudgeFeedback {
  id: string;
  showId: string;
  showName: string;
  date: Date;
  rating: number;
  comment?: string;
  exhibitorId?: string;
  anonymous: boolean;
}

// ============================================
// Judge Assignment Request Types
// ============================================

/**
 * Request to assign judge to show
 */
export interface JudgeAssignmentRequest {
  judgeId: string;
  showId: string;
  classes: string[]; // Class IDs
  travelProvided: boolean;
  accommodationProvided: boolean;
  fee?: number;
  expenses?: JudgeExpenses;
  specialInstructions?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  responseDeadline?: Date;
}

/**
 * Judge expenses for assignment
 */
export interface JudgeExpenses {
  travelReimbursement?: number;
  hotelProvided: boolean;
  hotelAmount?: number;
  mealsProvided: boolean;
  mealAmount?: number;
  mileageRate?: number;
  otherExpenses?: Array<{
    description: string;
    amount: number;
  }>;
  totalExpenses: number;
}

// ============================================
// Judge Panel Types
// ============================================

/**
 * Multiple judges for a class/show
 */
export interface JudgePanel {
  id: string;
  showId: string;
  classId?: string;
  judges: PanelJudge[];
  type: 'single' | 'panel' | 'provisional';
  leadJudgeId?: string;
}

/**
 * Judge in a panel
 */
export interface PanelJudge {
  judgeId: string;
  judgeName: string;
  role: 'lead' | 'panel' | 'provisional' | 'observer';
  responsibilities?: string[];
}

// ============================================
// Judge Schedule Types
// ============================================

/**
 * Judge's schedule for a show day
 */
export interface JudgeSchedule {
  judgeId: string;
  showId: string;
  date: Date;
  rings: RingSchedule[];
  breaks: ScheduleBreak[];
  estimatedEndTime: string;
  actualEndTime?: string;
}

/**
 * Ring schedule for judge
 */
export interface RingSchedule {
  ringNumber: number;
  classes: ScheduledClass[];
  startTime: string;
  endTime?: string;
  steward?: string;
}

/**
 * Scheduled class
 */
export interface ScheduledClass {
  classId: string;
  className: string;
  time: string;
  duration: number; // Minutes
  entryCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
}

/**
 * Schedule break
 */
export interface ScheduleBreak {
  type: 'short' | 'lunch' | 'other';
  startTime: string;
  duration: number; // Minutes
  description?: string;
}

// ============================================
// Export convenience types
// ============================================

export type Judge = JudgeProfile;
export type Qualification = JudgeQualification;
export type Schedule = JudgeSchedule;