// React Query hooks for template database operations
// Phase 4.1: Template System Integration
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getAllClassTemplates,
  getClassTemplateById,
  getClassTemplatesByOrganization,
  createClassTemplate,
  updateClassTemplate,
  deleteClassTemplate,
  searchClassTemplates,
  getAllShowTemplates,
  getShowTemplateById,
  getShowTemplatesByOrganization,
  createShowTemplate,
  updateShowTemplate,
  deleteShowTemplate,
  trackShowTemplateUsage,
  getTemplateFields,
  createTemplateField,
  createTemplateFields,
  updateTemplateField,
  deleteTemplateField,
  getTemplateStatistics,
  getMostUsedShowTemplates,
} from '@/services/database/queries/templateQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { invalidateQueries } from '@/services/database/queryClient';
import type {
  DbClassTemplateInsert,
  DbClassTemplateUpdate,
  DbShowTemplateInsert,
  DbShowTemplateUpdate,
  DbTemplateFieldInsert,
  DbTemplateFieldUpdate,
} from '@/types/database-mappings';

// ===== CLASS TEMPLATE HOOKS =====

// Get all class templates with fields
export const useClassTemplatesQuery = () => {
  return useQuery({
    queryKey: queryKeys.classTemplates,
    queryFn: async () => {
      const { data, error } = await getAllClassTemplates();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.static, // Templates are relatively static - 30 minutes stale
  });
};

// Get class template by ID
export const useClassTemplateQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.classTemplate(id),
    queryFn: async () => {
      const { data, error } = await getClassTemplateById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.static,
  });
};

// Get class templates by organization
export const useClassTemplatesByOrganizationQuery = (organization: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.classTemplatesByOrganization(organization),
    queryFn: async () => {
      const { data, error } = await getClassTemplatesByOrganization(organization);
      if (error) throw error;
      return data;
    },
    enabled: !!organization && enabled,
    ...cacheStrategies.static,
  });
};

// Search class templates
export const useClassTemplatesSearchQuery = (searchTerm: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.templateSearch(searchTerm),
    queryFn: async () => {
      const { data, error } = await searchClassTemplates(searchTerm);
      if (error) throw error;
      return data;
    },
    enabled: !!searchTerm && searchTerm.length >= 2 && enabled,
    ...cacheStrategies.dynamic, // Search results are more dynamic
  });
};

// Create class template mutation
export const useCreateClassTemplateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateData: DbClassTemplateInsert) => {
      const { data, error } = await createClassTemplate(templateData);
      if (error) throw error;
      return data;
    },
    onMutate: async (newTemplate) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.classTemplates });

      // Snapshot the previous value
      const previousTemplates = queryClient.getQueryData(queryKeys.classTemplates);

      // Optimistically update
      if (previousTemplates) {
        queryClient.setQueryData(queryKeys.classTemplates, (old: unknown) => {
          const templates = old as Array<{ id: string; name: string }>;
          return [...templates, { ...newTemplate, id: 'temp-' + Date.now() }];
        });
      }

      return { previousTemplates };
    },
    onError: (err, newTemplate, context) => {
      // Roll back on error
      if (context?.previousTemplates) {
        queryClient.setQueryData(queryKeys.classTemplates, context.previousTemplates);
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch relevant queries
      invalidateQueries.all('dogs');
      
      // Invalidate organization-specific queries
      if (variables.organization) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.classTemplatesByOrganization(variables.organization)
        });
      }
      
      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: queryKeys.templateStatistics });
    },
  });
};

// Update class template mutation
export const useUpdateClassTemplateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbClassTemplateUpdate }) => {
      const { data, error } = await updateClassTemplate(id, updates);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.classTemplate(id) });

      // Snapshot the previous value
      const previousTemplate = queryClient.getQueryData(queryKeys.classTemplate(id));

      // Optimistically update
      if (previousTemplate) {
        queryClient.setQueryData(queryKeys.classTemplate(id), (old: unknown) => {
          return { ...(old as Record<string, unknown>), ...updates };
        });
      }

      return { previousTemplate };
    },
    onError: (err, { id }, context) => {
      // Roll back on error
      if (context?.previousTemplate) {
        queryClient.setQueryData(queryKeys.classTemplate(id), context.previousTemplate);
      }
    },
    onSuccess: (data, { id }) => {
      // Update specific template cache
      queryClient.setQueryData(queryKeys.classTemplate(id), data);
      
      // Invalidate lists to ensure consistency
      invalidateQueries.lists('dogs');
      
      // Invalidate organization queries if organization changed
      if (data?.organization) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.classTemplatesByOrganization(data.organization)
        });
      }
    },
  });
};

// Delete class template mutation
export const useDeleteClassTemplateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await deleteClassTemplate(id);
      if (error) throw error;
      return data;
    },
    onMutate: async (deletedId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.classTemplates });

      // Snapshot the previous value
      const previousTemplates = queryClient.getQueryData(queryKeys.classTemplates);

      // Optimistically update by removing the template
      if (previousTemplates) {
        queryClient.setQueryData(queryKeys.classTemplates, (old: unknown) => {
          const templates = old as Array<{ id: string }>;
          return templates.filter(template => template.id !== deletedId);
        });
      }

      return { previousTemplates };
    },
    onError: (err, deletedId, context) => {
      // Roll back on error
      if (context?.previousTemplates) {
        queryClient.setQueryData(queryKeys.classTemplates, context.previousTemplates);
      }
    },
    onSuccess: (data, deletedId) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.classTemplate(deletedId) });
      
      // Invalidate lists
      invalidateQueries.all('dogs');
      
      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: queryKeys.templateStatistics });
    },
  });
};

// ===== SHOW TEMPLATE HOOKS =====

// Get all show templates
export const useShowTemplatesQuery = () => {
  return useQuery({
    queryKey: queryKeys.showTemplates,
    queryFn: async () => {
      const { data, error } = await getAllShowTemplates();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.static,
  });
};

// Get show template by ID
export const useShowTemplateQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.showTemplate(id),
    queryFn: async () => {
      const { data, error } = await getShowTemplateById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.static,
  });
};

// Get show templates by organization
export const useShowTemplatesByOrganizationQuery = (organization: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.showTemplatesByOrganization(organization),
    queryFn: async () => {
      const { data, error } = await getShowTemplatesByOrganization(organization);
      if (error) throw error;
      return data;
    },
    enabled: !!organization && enabled,
    ...cacheStrategies.static,
  });
};

// Create show template mutation
export const useCreateShowTemplateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateData: DbShowTemplateInsert) => {
      const { data, error } = await createShowTemplate(templateData);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      invalidateQueries.all('dogs');
      
      if (variables.organization) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.showTemplatesByOrganization(variables.organization)
        });
      }
      
      queryClient.invalidateQueries({ queryKey: queryKeys.templateStatistics });
    },
  });
};

// Update show template mutation
export const useUpdateShowTemplateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbShowTemplateUpdate }) => {
      const { data, error } = await updateShowTemplate(id, updates);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, { id }) => {
      // Update specific template cache
      queryClient.setQueryData(queryKeys.showTemplate(id), data);
      
      // Invalidate lists
      invalidateQueries.lists('dogs');
      
      if (data?.organization) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.showTemplatesByOrganization(data.organization)
        });
      }
    },
  });
};

// Track show template usage mutation
export const useTrackShowTemplateUsageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await trackShowTemplateUsage(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, id) => {
      // Update specific template cache
      queryClient.setQueryData(queryKeys.showTemplate(id), (old: unknown) => {
        if (old && data) {
          return { 
            ...(old as Record<string, unknown>), 
            usage_count: data.usage_count,
            last_used_at: data.last_used_at 
          };
        }
        return old;
      });
      
      // Invalidate most used templates
      queryClient.invalidateQueries({ queryKey: queryKeys.mostUsedTemplates });
    },
  });
};

// Delete show template mutation
export const useDeleteShowTemplateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await deleteShowTemplate(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, deletedId) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.showTemplate(deletedId) });
      
      // Invalidate lists
      invalidateQueries.all('dogs');
      
      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: queryKeys.templateStatistics });
    },
  });
};

// ===== TEMPLATE FIELD HOOKS =====

// Get template fields for a specific template
export const useTemplateFieldsQuery = (templateId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.templateFields(templateId),
    queryFn: async () => {
      const { data, error } = await getTemplateFields(templateId);
      if (error) throw error;
      return data;
    },
    enabled: !!templateId && enabled,
    ...cacheStrategies.static,
  });
};

// Create template field mutation
export const useCreateTemplateFieldMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fieldData: DbTemplateFieldInsert) => {
      const { data, error } = await createTemplateField(fieldData);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate template fields
      if (variables.template_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.templateFields(variables.template_id)
        });
        
        // Also invalidate the parent template to refresh field relationships
        queryClient.invalidateQueries({
          queryKey: queryKeys.classTemplate(variables.template_id)
        });
      }
    },
  });
};

// Create multiple template fields mutation
export const useCreateTemplateFieldsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fieldsData: DbTemplateFieldInsert[]) => {
      const { data, error } = await createTemplateFields(fieldsData);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all affected templates
      const templateIds = [...new Set(variables.map(field => field.template_id).filter(Boolean))];
      
      templateIds.forEach(templateId => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.templateFields(templateId!)
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.classTemplate(templateId!)
        });
      });
    },
  });
};

// Update template field mutation
export const useUpdateTemplateFieldMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbTemplateFieldUpdate }) => {
      const { data, error } = await updateTemplateField(id, updates);
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate template fields for the affected template
      if (data?.template_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.templateFields(data.template_id)
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.classTemplate(data.template_id)
        });
      }
    },
  });
};

// Delete template field mutation
export const useDeleteTemplateFieldMutation = () => {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await deleteTemplateField(id);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // We need to invalidate without knowing the template_id
      // So invalidate all template-related queries
      invalidateQueries.all('dogs');
    },
  });
};

// ===== UTILITY HOOKS =====

// Get template statistics
export const useTemplateStatisticsQuery = () => {
  return useQuery({
    queryKey: queryKeys.templateStatistics,
    queryFn: async () => {
      const { data, error } = await getTemplateStatistics();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.moderate, // Statistics can be moderately cached
  });
};

// Get most used show templates
export const useMostUsedShowTemplatesQuery = (limit = 10) => {
  return useQuery({
    queryKey: queryKeys.mostUsedTemplates,
    queryFn: async () => {
      const { data, error } = await getMostUsedShowTemplates(limit);
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.moderate,
  });
};

// Prefetch template details for performance
export const usePrefetchTemplate = () => {
  const queryClient = useQueryClient();

  return {
    prefetchClassTemplate: (id: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.classTemplate(id),
        queryFn: async () => {
          const { data, error } = await getClassTemplateById(id);
          if (error) throw error;
          return data;
        },
        staleTime: cacheStrategies.static.staleTime,
      });
    },
    prefetchShowTemplate: (id: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.showTemplate(id),
        queryFn: async () => {
          const { data, error } = await getShowTemplateById(id);
          if (error) throw error;
          return data;
        },
        staleTime: cacheStrategies.static.staleTime,
      });
    },
  };
};

// Combined template management hook
export const useTemplateManagement = () => {
  const classTemplatesQuery = useClassTemplatesQuery();
  const showTemplatesQuery = useShowTemplatesQuery();
  const statisticsQuery = useTemplateStatisticsQuery();
  
  const createClassTemplateMutation = useCreateClassTemplateMutation();
  const updateClassTemplateMutation = useUpdateClassTemplateMutation();
  const deleteClassTemplateMutation = useDeleteClassTemplateMutation();
  
  const createShowTemplateMutation = useCreateShowTemplateMutation();
  const updateShowTemplateMutation = useUpdateShowTemplateMutation();
  const deleteShowTemplateMutation = useDeleteShowTemplateMutation();
  const trackUsageMutation = useTrackShowTemplateUsageMutation();
  
  const prefetch = usePrefetchTemplate();

  return {
    // Queries
    classTemplates: classTemplatesQuery.data,
    showTemplates: showTemplatesQuery.data,
    statistics: statisticsQuery.data,
    isLoading: classTemplatesQuery.isLoading || showTemplatesQuery.isLoading,
    error: classTemplatesQuery.error || showTemplatesQuery.error,
    
    // Class Template Mutations
    createClassTemplate: createClassTemplateMutation.mutate,
    isCreatingClassTemplate: createClassTemplateMutation.isPending,
    
    updateClassTemplate: updateClassTemplateMutation.mutate,
    isUpdatingClassTemplate: updateClassTemplateMutation.isPending,
    
    deleteClassTemplate: deleteClassTemplateMutation.mutate,
    isDeletingClassTemplate: deleteClassTemplateMutation.isPending,
    
    // Show Template Mutations
    createShowTemplate: createShowTemplateMutation.mutate,
    isCreatingShowTemplate: createShowTemplateMutation.isPending,
    
    updateShowTemplate: updateShowTemplateMutation.mutate,
    isUpdatingShowTemplate: updateShowTemplateMutation.isPending,
    
    deleteShowTemplate: deleteShowTemplateMutation.mutate,
    isDeletingShowTemplate: deleteShowTemplateMutation.isPending,
    
    trackTemplateUsage: trackUsageMutation.mutate,
    isTrackingUsage: trackUsageMutation.isPending,
    
    // Utilities
    prefetch,
    refetchClassTemplates: classTemplatesQuery.refetch,
    refetchShowTemplates: showTemplatesQuery.refetch,
    refetchStatistics: statisticsQuery.refetch,
  };
};