import { useEffect, useState } from 'react';
import { useTemplateStore } from '@/store/templateStore';

/**
 * Custom hook for lazy loading templates
 * Ensures templates are loaded when components that need them mount
 */
export function useTemplates() {
  const [isLoading, setIsLoading] = useState(false);
  const { templates, isInitialized, ensureTemplatesLoaded } = useTemplateStore();

  useEffect(() => {
    // Only load if not already initialized and we don't have templates
    if (!isInitialized && templates.length === 0 && !isLoading) {
      setIsLoading(true);
      ensureTemplatesLoaded().finally(() => {
        setIsLoading(false);
      });
    }
  }, [isInitialized, templates.length, ensureTemplatesLoaded, isLoading]);

  return {
    templates,
    isLoading: isLoading || (!isInitialized && templates.length === 0),
    isInitialized
  };
}

/**
 * Hook for components that specifically need official templates
 */
export function useOfficialTemplates() {
  const { templates, isLoading, isInitialized } = useTemplates();
  const officialTemplates = templates.filter(t => t.isOfficial && t.isActive);

  return {
    templates: officialTemplates,
    isLoading,
    isInitialized
  };
}

/**
 * Hook for components that need templates filtered by organization
 */
export function useTemplatesByOrganization(organization: string | null) {
  const { templates, isLoading, isInitialized } = useTemplates();
  const filteredTemplates = organization 
    ? templates.filter(t => t.organization === organization && t.isActive)
    : templates.filter(t => t.isActive);

  return {
    templates: filteredTemplates,
    isLoading,
    isInitialized
  };
}