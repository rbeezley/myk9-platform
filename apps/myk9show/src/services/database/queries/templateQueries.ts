// Template-related database queries
// Phase 4.1: Template System Integration
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type {
  DbClassTemplateInsert,
  DbClassTemplateUpdate,
  DbShowTemplateInsert,
  DbShowTemplateUpdate,
  DbTemplateFieldInsert,
  DbTemplateFieldUpdate,
} from '../../../types/database-mappings';

// ===== CLASS TEMPLATE QUERIES =====

// Get all class templates with field relationships
export const getAllClassTemplates = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .select(`
        *,
        template_fields:template_fields(
          id,
          field_name,
          field_type,
          field_label,
          field_description,
          field_values,
          is_required,
          is_optional,
          default_value,
          field_order,
          field_group,
          validation_rules,
          is_active
        )
      `)
      .eq('is_active', true)
      .order('organization', { ascending: true })
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'select_all_with_fields', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'select_all');
    logQuery('class_template', 'select_all_with_fields', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get class template by ID with full details
export const getClassTemplateById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .select(`
        *,
        template_fields:template_fields(
          id,
          field_name,
          field_type,
          field_label,
          field_description,
          field_values,
          is_required,
          is_optional,
          default_value,
          field_order,
          field_group,
          validation_rules,
          is_active
        )
      `)
      .eq('id', id)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'select_by_id_detailed', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'select_by_id');
    logQuery('class_template', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get class templates by organization
export const getClassTemplatesByOrganization = async (organization: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .select(`
        *,
        template_fields:template_fields(
          id,
          field_name,
          field_type,
          field_label,
          field_description,
          field_values,
          is_required,
          is_optional,
          default_value,
          field_order,
          field_group,
          validation_rules,
          is_active
        )
      `)
      .eq('organization', organization)
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'select_by_organization', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'select_by_organization');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'select_by_organization');
    logQuery('class_template', 'select_by_organization', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create new class template
export const createClassTemplate = async (templateData: DbClassTemplateInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .insert([templateData])
      .select(`
        *,
        template_fields:template_fields(*)
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'insert');
    logQuery('class_template', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update class template
export const updateClassTemplate = async (id: string, updates: DbClassTemplateUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        template_fields:template_fields(*)
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'update');
    logQuery('class_template', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete class template (set is_active to false)
export const deleteClassTemplate = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'soft_delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'delete');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'delete');
    logQuery('class_template', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Search class templates by name or organization
export const searchClassTemplates = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('class_templates')
      .select(`
        *,
        template_fields:template_fields(*)
      `)
      .or(`name.ilike.%${searchTerm}%,organization.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('class_template', 'search', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'class_template', 'search');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_template', 'search');
    logQuery('class_template', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// ===== SHOW TEMPLATE QUERIES =====

// Get all show templates
export const getAllShowTemplates = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('show_templates')
      .select('*')
      .eq('is_active', true)
      .order('organization', { ascending: true })
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('show_template', 'select_all', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show_template', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'select_all');
    logQuery('show_template', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get show template by ID
export const getShowTemplateById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('show_templates')
      .select('*')
      .eq('id', id)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('show_template', 'select_by_id', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show_template', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'select_by_id');
    logQuery('show_template', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get show templates by organization
export const getShowTemplatesByOrganization = async (organization: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('show_templates')
      .select('*')
      .eq('organization', organization)
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('show_template', 'select_by_organization', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show_template', 'select_by_organization');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'select_by_organization');
    logQuery('show_template', 'select_by_organization', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create new show template
export const createShowTemplate = async (templateData: DbShowTemplateInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('show_templates')
      .insert([templateData])
      .select('*')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('show_template', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show_template', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'insert');
    logQuery('show_template', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update show template and increment usage count
export const updateShowTemplate = async (id: string, updates: DbShowTemplateUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('show_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('show_template', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show_template', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'update');
    logQuery('show_template', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Track template usage (update updated_at to record last usage)
// Note: usage_count and last_used_at columns don't exist in schema
export const trackShowTemplateUsage = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('show_templates')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name, updated_at')
      .single();

    const duration = Date.now() - startTime;
    logQuery('show_template', 'track_usage', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show_template', 'track_usage');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'track_usage');
    logQuery('show_template', 'track_usage', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Delete show template (hard delete - is_active column doesn't exist in schema)
export const deleteShowTemplate = async (id: string) => {
  const startTime = Date.now();

  try {
    // First get template info before deletion
    const { data: templateData, error: fetchError } = await supabase
      .from('show_templates')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('show_templates')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('show_template', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show_template', 'delete');
    }

    return { data: templateData, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'delete');
    logQuery('show_template', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// ===== TEMPLATE FIELD QUERIES =====

// Get template fields for a specific template
export const getTemplateFields = async (templateId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('template_fields')
      .select('*')
      .eq('template_id', templateId)
      .eq('is_active', true)
      .order('field_order', { ascending: true })
      .order('field_name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('template_field', 'select_by_template', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'template_field', 'select_by_template');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'template_field', 'select_by_template');
    logQuery('template_field', 'select_by_template', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create template field
export const createTemplateField = async (fieldData: DbTemplateFieldInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('template_fields')
      .insert([fieldData])
      .select('*')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('template_field', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'template_field', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'template_field', 'insert');
    logQuery('template_field', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Create multiple template fields
export const createTemplateFields = async (fieldsData: DbTemplateFieldInsert[]) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('template_fields')
      .insert(fieldsData)
      .select('*');
    
    const duration = Date.now() - startTime;
    logQuery('template_field', 'insert_batch', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'template_field', 'insert_batch');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'template_field', 'insert_batch');
    logQuery('template_field', 'insert_batch', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Update template field
export const updateTemplateField = async (id: string, updates: DbTemplateFieldUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('template_fields')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('template_field', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'template_field', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'template_field', 'update');
    logQuery('template_field', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Delete template field (hard delete - is_active column doesn't exist in schema)
export const deleteTemplateField = async (id: string) => {
  const startTime = Date.now();

  try {
    // First get field info before deletion
    const { data: fieldData, error: fetchError } = await supabase
      .from('template_fields')
      .select('id, field_name')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('template_fields')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('template_field', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'template_field', 'delete');
    }

    return { data: fieldData, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'template_field', 'delete');
    logQuery('template_field', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// ===== TEMPLATE STATISTICS =====

// Get template usage statistics
export const getTemplateStatistics = async () => {
  const startTime = Date.now();
  
  try {
    // Get counts for both class and show templates
    const [classTemplateCount, showTemplateCount] = await Promise.all([
      supabase
        .from('class_templates')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('show_templates')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

    const duration = Date.now() - startTime;
    
    if (classTemplateCount.error) {
      throw createDatabaseError(classTemplateCount.error, 'class_template', 'statistics');
    }
    
    if (showTemplateCount.error) {
      throw createDatabaseError(showTemplateCount.error, 'show_template', 'statistics');
    }
    
    const stats = {
      totalClassTemplates: classTemplateCount.count || 0,
      totalShowTemplates: showTemplateCount.count || 0,
      totalTemplates: (classTemplateCount.count || 0) + (showTemplateCount.count || 0),
    };
    
    logQuery('templates', 'statistics', duration);
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'templates', 'statistics');
    logQuery('templates', 'statistics', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get most used show templates
export const getMostUsedShowTemplates = async (limit = 10) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('show_templates')
      .select('id, name, organization, usage_count, last_used_at')
      .eq('is_active', true)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(limit);
    
    const duration = Date.now() - startTime;
    logQuery('show_template', 'most_used', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show_template', 'most_used');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show_template', 'most_used');
    logQuery('show_template', 'most_used', duration, dbError.message);
    return { data: [], error: dbError };
  }
};