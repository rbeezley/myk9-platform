// Health records database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { 
  HealthFilters,
  HealthStatistics 
} from '@/types/health';
import type { Database } from '@/types/supabase';

type DbHealthRecordInsert = Database['public']['Tables']['health_records']['Insert'];
type DbHealthRecordUpdate = Database['public']['Tables']['health_records']['Update'];

type DbVaccinationInsert = Database['public']['Tables']['vaccinations']['Insert'];
type DbVaccinationUpdate = Database['public']['Tables']['vaccinations']['Update'];

type DbMedicationInsert = Database['public']['Tables']['medications']['Insert'];
type DbMedicationUpdate = Database['public']['Tables']['medications']['Update'];

type DbAllergyInsert = Database['public']['Tables']['allergies']['Insert'];
type DbAllergyUpdate = Database['public']['Tables']['allergies']['Update'];

type DbVetVisitInsert = Database['public']['Tables']['vet_visits']['Insert'];
type DbVetVisitUpdate = Database['public']['Tables']['vet_visits']['Update'];

// ========================================
// HEALTH RECORDS (Parent table)
// ========================================

export const getAllHealthRecords = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('health_records')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('health_record', 'select_all', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'health_record', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'select_all');
    logQuery('health_record', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getHealthRecordById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('health_records')
      .select('*')
      .eq('id', id)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('health_record', 'select_by_id', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'health_record', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'select_by_id');
    logQuery('health_record', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createHealthRecord = async (healthRecord: DbHealthRecordInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('health_records')
      .insert(healthRecord)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('health_record', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'health_record', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'insert');
    logQuery('health_record', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateHealthRecord = async (id: string, updates: DbHealthRecordUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('health_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('health_record', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'health_record', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'update');
    logQuery('health_record', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteHealthRecord = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('health_records')
      .delete()
      .eq('id', id);
    
    const duration = Date.now() - startTime;
    logQuery('health_record', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'health_record', 'delete');
    }
    
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'delete');
    logQuery('health_record', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// ========================================
// VACCINATIONS
// ========================================

export const getAllVaccinations = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('vaccinations')
      .select('*')
      .order('date_administered', { ascending: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('vaccination', 'select_all', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vaccination', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'select_all');
    logQuery('vaccination', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getVaccinationById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('id', id)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('vaccination', 'select_by_id', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vaccination', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'select_by_id');
    logQuery('vaccination', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createVaccination = async (vaccination: DbVaccinationInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('vaccinations')
      .insert(vaccination)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('vaccination', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vaccination', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'insert');
    logQuery('vaccination', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateVaccination = async (id: string, updates: DbVaccinationUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('vaccinations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('vaccination', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vaccination', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'update');
    logQuery('vaccination', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteVaccination = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('vaccinations')
      .delete()
      .eq('id', id);
    
    const duration = Date.now() - startTime;
    logQuery('vaccination', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vaccination', 'delete');
    }
    
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'delete');
    logQuery('vaccination', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// Get upcoming vaccinations (due within next 30 days)
export const getUpcomingVaccinations = async (dogId?: string) => {
  const startTime = Date.now();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  try {
    let query = supabase
      .from('vaccinations')
      .select('*')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', thirtyDaysFromNow.toISOString())
      .order('expiration_date', { ascending: true });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('vaccination', 'select_upcoming', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vaccination', 'select_upcoming');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'select_upcoming');
    logQuery('vaccination', 'select_upcoming', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// ========================================
// MEDICATIONS
// ========================================

export const getAllMedications = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('medications')
      .select('*')
      .order('start_date', { ascending: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('medication', 'select_all', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'medication', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'select_all');
    logQuery('medication', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getActiveMedications = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('medications')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('medication', 'select_active', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'medication', 'select_active');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'select_active');
    logQuery('medication', 'select_active', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createMedication = async (medication: DbMedicationInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('medications')
      .insert(medication)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('medication', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'medication', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'insert');
    logQuery('medication', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateMedication = async (id: string, updates: DbMedicationUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('medications')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('medication', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'medication', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'update');
    logQuery('medication', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteMedication = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('medications')
      .delete()
      .eq('id', id);
    
    const duration = Date.now() - startTime;
    logQuery('medication', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'medication', 'delete');
    }
    
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'delete');
    logQuery('medication', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// ========================================
// ALLERGIES
// ========================================

export const getAllAllergies = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('allergies')
      .select('*')
      .order('diagnosed_date', { ascending: false, nullsFirst: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('allergy', 'select_all', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'allergy', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'select_all');
    logQuery('allergy', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getActiveAllergies = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('allergies')
      .select('*')
      .order('severity', { ascending: false, nullsFirst: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('allergy', 'select_active', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'allergy', 'select_active');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'select_active');
    logQuery('allergy', 'select_active', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createAllergy = async (allergy: DbAllergyInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('allergies')
      .insert(allergy)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('allergy', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'allergy', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'insert');
    logQuery('allergy', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateAllergy = async (id: string, updates: DbAllergyUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('allergies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('allergy', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'allergy', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'update');
    logQuery('allergy', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteAllergy = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('allergies')
      .delete()
      .eq('id', id);
    
    const duration = Date.now() - startTime;
    logQuery('allergy', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'allergy', 'delete');
    }
    
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'delete');
    logQuery('allergy', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// ========================================
// VET VISITS
// ========================================

export const getAllVetVisits = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('vet_visits')
      .select('*')
      .order('visit_date', { ascending: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'select_all', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'select_all');
    logQuery('vet_visit', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getVetVisitsRequiringFollowUp = async (dogId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('vet_visits')
      .select('*')
      .not('follow_up_date', 'is', null)
      .order('follow_up_date', { ascending: true, nullsFirst: false });
    
    if (dogId) {
      query = query.eq('dog_id', dogId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'select_follow_up', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'select_follow_up');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'select_follow_up');
    logQuery('vet_visit', 'select_follow_up', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createVetVisit = async (vetVisit: DbVetVisitInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('vet_visits')
      .insert(vetVisit)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'insert');
    logQuery('vet_visit', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateVetVisit = async (id: string, updates: DbVetVisitUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('vet_visits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'update');
    logQuery('vet_visit', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteVetVisit = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('vet_visits')
      .delete()
      .eq('id', id);
    
    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'delete');
    }
    
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'delete');
    logQuery('vet_visit', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// ========================================
// HEALTH STATISTICS & ANALYTICS
// ========================================

export const getHealthStatistics = async (dogId: string): Promise<{ data: HealthStatistics | null; error: unknown }> => {
  const startTime = Date.now();
  
  try {
    // Get vaccination stats
    const { data: vaccinations } = await getAllVaccinations(dogId);
    const { data: upcomingVaccinations } = await getUpcomingVaccinations(dogId);
    const overdueVaccinations = vaccinations?.filter(v => 
      v.expiration_date && new Date(v.expiration_date) < new Date()
    ) || [];
    
    // Get medication stats
    const { data: activeMedications } = await getActiveMedications(dogId);
    
    // Get allergy stats
    const { data: allergies } = await getActiveAllergies(dogId);
    
    // Get vet visit stats
    const { data: vetVisits } = await getAllVetVisits(dogId);
    const { data: followUpVisits } = await getVetVisitsRequiringFollowUp(dogId);
    
    // Calculate next vaccination due
    const nextVaccination = upcomingVaccinations?.[0];
    
    // Get last visit date
    const lastVisit = vetVisits?.[0];
    
    const statistics: HealthStatistics = {
      total_vaccinations: vaccinations?.length || 0,
      upcoming_vaccinations: upcomingVaccinations?.length || 0,
      overdue_vaccinations: overdueVaccinations.length,
      active_medications: activeMedications?.length || 0,
      total_allergies: allergies?.length || 0,
      total_vet_visits: vetVisits?.length || 0,
      upcoming_appointments: followUpVisits?.length || 0,
      last_visit_date: lastVisit?.visit_date,
      next_vaccination_due: nextVaccination?.expiration_date || undefined,
    };
    
    const duration = Date.now() - startTime;
    logQuery('health_statistics', 'calculate', duration);
    
    return { data: statistics, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_statistics', 'calculate');
    logQuery('health_statistics', 'calculate', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// ========================================
// COMPREHENSIVE HEALTH TIMELINE
// ========================================

export const getHealthTimeline = async (dogId: string, filters?: HealthFilters) => {
  const startTime = Date.now();
  
  try {
    const timelineEntries: Array<{
      id: string;
      type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit';
      date: string;
      title: string;
      description?: string;
      details: unknown;
      dog_id: string;
      urgent?: boolean;
      status?: string;
    }> = [];
    
    // Get all health records if requested
    if (!filters?.record_type || filters.record_type.includes('vaccination')) {
      const { data: vaccinations } = await getAllVaccinations(dogId);
      vaccinations?.forEach(vaccination => {
        timelineEntries.push({
          id: vaccination.id,
          type: 'vaccination' as const,
          date: vaccination.date_administered,
          title: `${vaccination.vaccine_name} Vaccination`,
          description: vaccination.administered_by ? `Administered by ${vaccination.administered_by}` : undefined,
          details: vaccination,
          dog_id: dogId,
          urgent: !!(vaccination.expiration_date && new Date(vaccination.expiration_date) < new Date()),
          status: vaccination.expiration_date && new Date(vaccination.expiration_date) < new Date() ? 'overdue' : 'completed'
        });
      });
    }
    
    if (!filters?.record_type || filters.record_type.includes('medication')) {
      const { data: medications } = await getAllMedications(dogId);
      medications?.forEach(medication => {
        timelineEntries.push({
          id: medication.id,
          type: 'medication' as const,
          date: medication.start_date || medication.created_at!,
          title: `${medication.medication_name}`,
          description: medication.prescribing_vet ? `Prescribed by ${medication.prescribing_vet}` : undefined,
          details: medication,
          dog_id: dogId,
          urgent: false,
          status: medication.is_active ? 'completed' : 'completed'
        });
      });
    }
    
    if (!filters?.record_type || filters.record_type.includes('allergy')) {
      const { data: allergies } = await getAllAllergies(dogId);
      allergies?.forEach(allergy => {
        timelineEntries.push({
          id: allergy.id,
          type: 'allergy' as const,
          date: allergy.diagnosed_date || allergy.created_at || new Date().toISOString(),
          title: `Allergy: ${allergy.allergen}`,
          description: allergy.severity ? `Severity: ${allergy.severity}` : undefined,
          details: allergy,
          dog_id: dogId,
          urgent: allergy.severity === 'severe' || allergy.severity === 'life_threatening',
          status: 'completed'
        });
      });
    }
    
    if (!filters?.record_type || filters.record_type.includes('vet_visit')) {
      const { data: vetVisits } = await getAllVetVisits(dogId);
      vetVisits?.forEach(visit => {
        timelineEntries.push({
          id: visit.id,
          type: 'vet_visit' as const,
          date: visit.visit_date,
          title: `Vet Visit: ${visit.reason}`,
          description: visit.vet_name ? `Seen by ${visit.vet_name}` : undefined,
          details: visit,
          dog_id: dogId,
          urgent: !!visit.follow_up_date,
          status: visit.follow_up_date ? 'upcoming' : 'completed'
        });
      });
    }
    
    // Apply date filters
    let filteredEntries = timelineEntries;
    if (filters?.date_range) {
      filteredEntries = timelineEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        const startDate = new Date(filters.date_range!.start);
        const endDate = new Date(filters.date_range!.end);
        return entryDate >= startDate && entryDate <= endDate;
      });
    }
    
    // Sort by date (most recent first)
    filteredEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const duration = Date.now() - startTime;
    logQuery('health_timeline', 'select_comprehensive', duration);
    
    return { data: filteredEntries, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_timeline', 'select_comprehensive');
    logQuery('health_timeline', 'select_comprehensive', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// ========================================
// SEARCH FUNCTIONS
// ========================================

export const searchHealthRecords = async (dogId: string, searchTerm: string, filters?: HealthFilters) => {
  const startTime = Date.now();
  
  try {
    const results: Array<{
      id: string;
      type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit';
      title: string;
      date: string;
      details: unknown;
    }> = [];
    
    // Search vaccinations
    if (!filters?.record_type || filters.record_type.includes('vaccination')) {
      const { data: vaccinations } = await supabase
        .from('vaccinations')
        .select('*')
        .eq('dog_id', dogId)
        .or(`vaccine_name.ilike.%${searchTerm}%,administered_by.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      
      vaccinations?.forEach(vaccination => {
        results.push({
          id: vaccination.id,
          type: 'vaccination' as const,
          title: `${vaccination.vaccine_name} Vaccination`,
          date: vaccination.date_administered,
          details: vaccination
        });
      });
    }
    
    // Search medications
    if (!filters?.record_type || filters.record_type.includes('medication')) {
      const { data: medications } = await supabase
        .from('medications')
        .select('*')
        .eq('dog_id', dogId)
        .or(`medication_name.ilike.%${searchTerm}%,prescribing_vet.ilike.%${searchTerm}%,reason.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      
      medications?.forEach(medication => {
        results.push({
          id: medication.id,
          type: 'medication' as const,
          title: medication.medication_name,
          date: medication.start_date || medication.created_at!,
          details: medication
        });
      });
    }
    
    // Search allergies
    if (!filters?.record_type || filters.record_type.includes('allergy')) {
      const { data: allergies } = await supabase
        .from('allergies')
        .select('*')
        .eq('dog_id', dogId)
        .or(`allergen.ilike.%${searchTerm}%,reaction.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      
      allergies?.forEach(allergy => {
        results.push({
          id: allergy.id,
          type: 'allergy' as const,
          title: `Allergy: ${allergy.allergen}`,
          date: allergy.diagnosed_date || allergy.created_at || new Date().toISOString(),
          details: allergy
        });
      });
    }
    
    // Search vet visits
    if (!filters?.record_type || filters.record_type.includes('vet_visit')) {
      const { data: vetVisits } = await supabase
        .from('vet_visits')
        .select('*')
        .eq('dog_id', dogId)
        .or(`reason.ilike.%${searchTerm}%,diagnosis.ilike.%${searchTerm}%,treatment.ilike.%${searchTerm}%,vet_name.ilike.%${searchTerm}%,clinic_name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      
      vetVisits?.forEach(visit => {
        results.push({
          id: visit.id,
          type: 'vet_visit' as const,
          title: `Vet Visit: ${visit.reason}`,
          date: visit.visit_date,
          details: visit
        });
      });
    }
    
    // Sort by date (most recent first)
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const duration = Date.now() - startTime;
    logQuery('health_search', 'search_all', duration);
    
    return { data: results, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_search', 'search_all');
    logQuery('health_search', 'search_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};