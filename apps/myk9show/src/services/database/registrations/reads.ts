// Registration-related database queries
// Phase 4.3: Registration System Integration
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type {
  DbDogRegistrationInsert,
  DbDogRegistrationUpdate,
} from '../../../types/database-mappings';

// Get all registrations with dog information
export const getAllRegistrations = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(`
        *,
        dog:dogs(
          id,
          name,
          call_name,
          breed,
          sex,
          date_of_birth
        )
      `)
      .order('created_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'select_all_with_dogs', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'select_all');
    logQuery('dog_registration', 'select_all_with_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get registration by ID with full details
export const getRegistrationById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(`
        *,
        dog:dogs(
          id,
          name,
          call_name,
          breed,
          sex,
          date_of_birth,
          color,
          microchip_number
        )
      `)
      .eq('id', id)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'select_by_id_detailed', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'select_by_id');
    logQuery('dog_registration', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get registrations by dog ID
export const getRegistrationsByDog = async (dogId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select('*')
      .eq('dog_id', dogId)
      .order('registration_date', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'select_by_dog', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'select_by_dog');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'select_by_dog');
    logQuery('dog_registration', 'select_by_dog', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get registrations by organization
export const getRegistrationsByOrganization = async (organization: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(`
        *,
        dog:dogs(
          id,
          name,
          call_name,
          breed
        )
      `)
      .eq('organization', organization)
      .order('registration_date', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'select_by_organization', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'select_by_organization');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'select_by_organization');
    logQuery('dog_registration', 'select_by_organization', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create new registration
export const createRegistration = async (registrationData: DbDogRegistrationInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .insert([registrationData])
      .select(`
        *,
        dog:dogs(
          id,
          name,
          call_name,
          breed
        )
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'insert');
    logQuery('dog_registration', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update registration
export const updateRegistration = async (id: string, updates: DbDogRegistrationUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        dog:dogs(
          id,
          name,
          call_name,
          breed
        )
      `)
      .single();

    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'update');
    logQuery('dog_registration', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Delete registration
export const deleteRegistration = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .delete()
      .eq('id', id)
      .select('id, dog_id, registration_number, organization')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'delete');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'delete');
    logQuery('dog_registration', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Search registrations by registration number or dog name
export const searchRegistrations = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(`
        *,
        dog:dogs(
          id,
          name,
          call_name,
          breed
        )
      `)
      .ilike('registration_number', `%${searchTerm}%`)
      .order('created_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'search', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'search');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'search');
    logQuery('dog_registration', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get registration statistics
export const getRegistrationStatistics = async () => {
  const startTime = Date.now();
  
  try {
    // Get total count
    const { error: countError, count } = await supabase
      .from('dog_registrations')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      throw createDatabaseError(countError, 'dog_registration', 'statistics_count');
    }

    // Get statistics by organization
    const { data: orgStats, error: orgError } = await supabase
      .from('dog_registrations')
      .select('organization')
      .order('organization');

    if (orgError) {
      throw createDatabaseError(orgError, 'dog_registration', 'statistics_org');
    }

    // Get statistics by verified status
    const { data: verifiedStats, error: verifiedError } = await supabase
      .from('dog_registrations')
      .select('verified')
      .order('verified');

    if (verifiedError) {
      throw createDatabaseError(verifiedError, 'dog_registration', 'statistics_verified');
    }

    const duration = Date.now() - startTime;

    // Calculate organization statistics
    const organizationCounts = (orgStats || []).reduce((acc, item) => {
      const org = item.organization || 'Unknown';
      acc[org] = (acc[org] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate verified statistics
    const verifiedCounts = (verifiedStats || []).reduce((acc, item) => {
      const verified = item.verified ? 'Verified' : 'Unverified';
      acc[verified] = (acc[verified] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stats = {
      total: count || 0,
      byOrganization: organizationCounts,
      byVerified: verifiedCounts,
    };
    
    logQuery('dog_registration', 'statistics', duration);
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'statistics');
    logQuery('dog_registration', 'statistics', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Validate registration number format by organization
export const validateRegistrationNumber = async (organization: string, registrationNumber: string) => {
  const startTime = Date.now();
  
  try {
    // Check if registration number already exists in the same organization
    const { data, error } = await supabase
      .from('dog_registrations')
      .select('id, registration_number')
      .eq('organization', organization)
      .eq('registration_number', registrationNumber);
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'validate_registration_number', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'validate_registration_number');
    }
    
    const exists = data && data.length > 0;
    const isValid = validateRegistrationNumberFormat(organization, registrationNumber);
    
    return { 
      data: { 
        isValid, 
        exists, 
        message: exists ? 'Registration number already exists' : isValid ? 'Valid' : 'Invalid format' 
      }, 
      error: null 
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'validate_registration_number');
    logQuery('dog_registration', 'validate_registration_number', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Helper function to validate registration number format by organization
const validateRegistrationNumberFormat = (organization: string, registrationNumber: string): boolean => {
  if (!registrationNumber || registrationNumber.trim() === '') {
    return false;
  }

  const cleanNumber = registrationNumber.trim().toUpperCase();

  switch (organization.toUpperCase()) {
    case 'AKC':
      // AKC format: letters followed by numbers (e.g., SS12345678, WS65432109)
      return /^[A-Z]{2}\d{8}$/.test(cleanNumber);
      
    case 'UKC':
      // UKC format: typically alphanumeric (e.g., A123456, AB123456)
      return /^[A-Z]{1,2}\d{6,}$/.test(cleanNumber);
      
    case 'CKC':
      // CKC format: letters and numbers (e.g., AB123456, ABC123456)
      return /^[A-Z]{2,3}\d{6,}$/.test(cleanNumber);
      
    case 'FCI':
      // FCI format: country code + numbers (e.g., USA123456789)
      return /^[A-Z]{3}\d{6,}$/.test(cleanNumber);
      
    default:
      // For other organizations, just check it's not empty and has reasonable length
      return cleanNumber.length >= 4 && cleanNumber.length <= 20;
  }
};

// Get registrations by owner ID (through dog relationship)
export const getRegistrationsByOwner = async (ownerId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(`
        *,
        dog:dogs!inner(
          id,
          name,
          call_name,
          breed
        )
      `)
      .eq('dogs.owner_id', ownerId)
      .order('registration_date', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('dog_registration', 'select_by_owner', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog_registration', 'select_by_owner');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog_registration', 'select_by_owner');
    logQuery('dog_registration', 'select_by_owner', duration, dbError.message);
    return { data: [], error: dbError };
  }
};