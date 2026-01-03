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
  
  templateGroups.forEach((group, id) => {
    if (group.length > 1) {
      console.log(`Found ${group.length} duplicates of template ${id}:`, group[0].templateName);
      // Keep the first one, mark others for deletion
      group.slice(1).forEach(duplicate => {
        duplicates.push(duplicate.id);
      });
    }
  });
  
  // Delete duplicates
  if (duplicates.length > 0) {
    console.log(`Removing ${duplicates.length} duplicate templates...`);
    
    // Directly update the store to remove duplicates
    useTemplateStore.setState(state => ({
      templates: state.templates.filter((template, index, array) => {
        // Keep only the first occurrence of each ID
        return array.findIndex(t => t.id === template.id) === index;
      })
    }));
    
    console.log('Duplicate templates removed');
  }
  
  return duplicates.length;
}

// Import for use in store
import { useTemplateStore } from '@/store/templateStore';