import { ClassTemplate } from '@/types/template.types';

// Debug utility to inspect template data in localStorage
export const debugTemplates = () => {
  const storage = JSON.parse(localStorage.getItem('template-storage') || '{}');
  const templates = storage?.state?.templates || [];
  
  console.log('Template count:', templates.length);
  
  templates.forEach((template: ClassTemplate, index: number) => {
    console.log(`Template ${index + 1}:`, template.templateName);
    console.log('  Organization:', template.organization, typeof template.organization);
    console.log('  ShowType:', template.showType, typeof template.showType);
    console.log('  Status:', template.status, typeof template.status);
    console.log('  Type:', template.type, typeof template.type);
    console.log('---');
  });
  
  return templates;
};