// Health Record Types matching Supabase schema

export interface HealthRecord {
  id: string;
  dog_id: string;
  record_type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit' | 'general';
  title?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VaccinationRecord {
  id: string;
  dog_id: string;
  health_record_id?: string;
  vaccine_name: string;
  date_given: string;
  expiration_date?: string;
  vet_name?: string;
  clinic_name?: string;
  clinic_address?: string;
  lot_number?: string;
  manufacturer?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VetVisitRecord {
  id: string;
  dog_id: string;
  health_record_id?: string;
  visit_date: string;
  reason: string;
  diagnosis?: string;
  treatment?: string;
  vet_name?: string;
  clinic_name?: string;
  clinic_address?: string;
  clinic_phone?: string;
  cost?: number;
  requires_follow_up?: boolean;
  follow_up_date?: string;
  follow_up_notes?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicationRecord {
  id: string;
  dog_id: string;
  health_record_id?: string;
  medication_name: string;
  dosage?: string;
  frequency?: string;
  prescribed_by?: string;
  pharmacy?: string;
  prescription_number?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AllergyRecord {
  id: string;
  dog_id: string;
  health_record_id?: string;
  allergen: string;
  reaction?: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  discovered_date?: string;
  discovered_by?: string;
  is_active?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Combined health timeline entry
export interface HealthTimelineEntry {
  id: string;
  type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit' | 'health_record';
  date: string;
  title: string;
  description?: string;
  details: VaccinationRecord | MedicationRecord | AllergyRecord | VetVisitRecord | HealthRecord;
  dog_id: string;
  urgent?: boolean;
  status?: 'completed' | 'scheduled' | 'overdue' | 'upcoming';
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
  related_record_id?: string;
  related_record_type?: 'vaccination' | 'medication' | 'vet_visit';
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
  last_visit_date?: string;
  next_vaccination_due?: string;
}

// Health search filters
export interface HealthFilters {
  record_type?: ('vaccination' | 'medication' | 'allergy' | 'vet_visit')[];
  date_range?: {
    start: string;
    end: string;
  };
  severity?: ('mild' | 'moderate' | 'severe' | 'life_threatening')[];
  is_active?: boolean;
  vet_name?: string;
  clinic_name?: string;
}
