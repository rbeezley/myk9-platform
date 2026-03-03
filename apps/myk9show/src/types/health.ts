// Health Record Types matching Supabase schema

export interface HealthRecord {
  id: string;
  dog_id: string;
  record_type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit' | 'general';
  title?: string | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface VaccinationRecord {
  id: string;
  dog_id: string;
  health_record_id?: string | undefined;
  vaccine_name: string;
  date_given: string;
  expiration_date?: string | undefined;
  vet_name?: string | undefined;
  clinic_name?: string | undefined;
  clinic_address?: string | undefined;
  lot_number?: string | undefined;
  manufacturer?: string | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface VetVisitRecord {
  id: string;
  dog_id: string;
  health_record_id?: string | undefined;
  visit_date: string;
  reason: string;
  diagnosis?: string | undefined;
  treatment?: string | undefined;
  vet_name?: string | undefined;
  clinic_name?: string | undefined;
  clinic_address?: string | undefined;
  clinic_phone?: string | undefined;
  cost?: number | undefined;
  requires_follow_up?: boolean | undefined;
  follow_up_date?: string | undefined;
  follow_up_notes?: string | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface MedicationRecord {
  id: string;
  dog_id: string;
  health_record_id?: string | undefined;
  medication_name: string;
  dosage?: string | undefined;
  frequency?: string | undefined;
  prescribed_by?: string | undefined;
  pharmacy?: string | undefined;
  prescription_number?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  is_active?: boolean | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface AllergyRecord {
  id: string;
  dog_id: string;
  health_record_id?: string | undefined;
  allergen: string;
  reaction?: string | undefined;
  severity?: 'mild' | 'moderate' | 'severe' | 'life_threatening' | undefined;
  discovered_date?: string | undefined;
  discovered_by?: string | undefined;
  is_active?: boolean | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Combined health timeline entry
export interface HealthTimelineEntry {
  id: string;
  type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit' | 'health_record' | 'ofa_screening' | 'genetic_screening';
  date: string;
  title: string;
  description?: string | undefined;
  details: VaccinationRecord | MedicationRecord | AllergyRecord | VetVisitRecord | HealthRecord | OFAScreeningRecord | GeneticScreeningRecord;
  dog_id: string;
  urgent?: boolean | undefined;
  status?: 'completed' | 'scheduled' | 'overdue' | 'upcoming' | undefined;
}

// Health alert types
export interface HealthAlert {
  id: string;
  dog_id: string;
  type: 'vaccination_due' | 'medication_reminder' | 'vet_appointment' | 'follow_up_required';
  title: string;
  message: string;
  due_date: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  related_record_id?: string | undefined;
  related_record_type?: 'vaccination' | 'medication' | 'vet_visit' | undefined;
  created_at: string;
}

// Health statistics
export interface HealthStatistics {
  total_vaccinations: number;
  upcoming_vaccinations: number;
  overdue_vaccinations: number;
  active_medications: number;
  total_allergies: number;
  total_vet_visits: number;
  upcoming_appointments: number;
  last_visit_date?: string | undefined;
  next_vaccination_due?: string | undefined;
}

// OFA/Health Screening Record
export interface OFAScreeningRecord {
  id: string;
  dog_id: string;
  owner_id: string;
  test_type: 'hips' | 'elbows' | 'eyes' | 'heart' | 'patella' | 'thyroid';
  test_date: string;
  result?: string | undefined;
  certification_number?: string | undefined;
  status: 'normal' | 'carrier' | 'affected' | 'pending';
  veterinarian?: string | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Genetic Screening Record
export interface GeneticScreeningRecord {
  id: string;
  dog_id: string;
  owner_id: string;
  provider: string;
  test_date: string;
  results: Array<{ marker: string; result: string; status?: string }>;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Health search filters
export interface HealthFilters {
  record_type?: ('vaccination' | 'medication' | 'allergy' | 'vet_visit' | 'ofa_screening' | 'genetic_screening')[] | undefined;
  date_range?: {
    start: string;
    end: string;
  } | undefined;
  severity?: ('mild' | 'moderate' | 'severe' | 'life_threatening')[] | undefined;
  is_active?: boolean | undefined;
  vet_name?: string | undefined;
  clinic_name?: string | undefined;
}
