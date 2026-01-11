/**
 * Utility to export all templates from localStorage to a format
 * that can be added to mockTemplatesWithFields.ts
 *
 * Run this in the browser console, then copy the output
 */
import { ClassTemplate } from '@/types/template.types';
import { logger } from '@/services/LoggingService';

export const exportAllTemplatesToFile = () => {
  // Get templates from localStorage
  const storage = JSON.parse(localStorage.getItem('template-storage') || '{}');
  const templates = storage?.state?.templates || [];

  logger.info('Templates found in localStorage', 'export', { count: templates.length });
  
  // Generate TypeScript code for each template
  let output = '// Exported Templates from localStorage\n\n';
  
  templates.forEach((template: ClassTemplate) => {
    // Clean up the template name for a valid TypeScript constant name
    const constName = template.templateName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') + '_TEMPLATE';
    
    // Convert the template object to a formatted string
    const templateCode = `export const ${constName}: ClassTemplate = ${JSON.stringify(template, (key, value) => {
      // Convert date strings to Date objects
      if (key === 'createdAt' || key === 'updatedAt') {
        return `new Date('${value}')`;
      }
      return value;
    }, 2)};`;
    
    // Fix the date formatting and escape single quotes in strings
    const fixedCode = templateCode
      .replace(/"new Date\('([^']+)'\)"/g, "new Date('$1')")
      .replace(/"(Organization|ShowType|TemplateStatus|TemplateType)\.([^"]+)"/g, '$1.$2')
      // Fix string escaping - convert double quotes to single quotes and escape apostrophes
      .replace(/"([^"]*(?:\\'[^"]*)*)"/g, (match, content) => {
        // Only convert if it's a regular string value, not a function call or enum
        if (content.includes('new Date(') || content.includes('.')) {
          return match;
        }
        const escaped = content.replace(/'/g, "\\'");
        return `'${escaped}'`;
      });
    
    output += fixedCode + '\n\n';
  });
  
  // Generate the export array
  output += '// Add these to STRUCTURED_TEMPLATES array:\n';
  output += '// [\n';
  templates.forEach((template: ClassTemplate) => {
    const constName = template.templateName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') + '_TEMPLATE';
    output += `//   ${constName},\n`;
  });
  output += '// ]\n';

  logger.info('Template export completed', 'export', {
    output,
    instructions: [
      'Copy the output above',
      'Add it to /src/data/mockTemplatesWithFields.ts before the STRUCTURED_TEMPLATES export',
      'Update the STRUCTURED_TEMPLATES array to include your templates'
    ]
  });

  // Also return the data for potential file saving
  return {
    templates,
    code: output
  };
};

// Make it available in the browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).exportAllTemplatesToFile = exportAllTemplatesToFile;
}