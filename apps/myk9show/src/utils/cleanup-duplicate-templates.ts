// Utility to clean up duplicate templates in the store
export function cleanupDuplicateTemplates() {
  const { templates } = useTemplateStore.getState();
  
  // Group templates by ID
  const templateGroups = new Map<string, typeof templates>();
  
  templates.forEach(template => {
    const existing = templateGroups.get(template.id) || [];
    existing.push(template);
    templateGroups.set(template.id, existing);
  });
  
  // Find duplicates
  const duplicates: string[] = [];
  
  templateGroups.forEach((group) => {
    if (group.length > 1) {
      // Keep the first one, mark others for deletion
      group.slice(1).forEach(duplicate => {
        duplicates.push(duplicate.id);
      });
    }
  });

  // Delete duplicates
  if (duplicates.length > 0) {
    // Directly update the store to remove duplicates
    useTemplateStore.setState(state => ({
      templates: state.templates.filter((template, index, array) => {
        // Keep only the first occurrence of each ID
        return array.findIndex(t => t.id === template.id) === index;
      })
    }));
  }
  
  return duplicates.length;
}

// Import for use in store
import { useTemplateStore } from '@/store/templateStore';