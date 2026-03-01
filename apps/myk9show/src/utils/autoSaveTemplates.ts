/**
 * Utility to automatically save localStorage templates to the mock data file
 * This creates a seamless "Save to Permanent Storage" feature
 */

import { ClassTemplate } from '@/types/template.types';

interface SaveTemplatesResult {
  success: boolean;
  message: string;
  templatesCount: number;
  errors?: string[];
}

export const autoSaveTemplatesToMockData = (): SaveTemplatesResult => {
  try {
    // Get templates from localStorage
    const storage = JSON.parse(localStorage.getItem('template-storage') || '{}');
    const templates: ClassTemplate[] = storage?.state?.templates || [];

    if (templates.length === 0) {
      return {
        success: false,
        message: 'No templates found in localStorage',
        templatesCount: 0,
      };
    }

    // Generate the updated mock data file content
    const mockDataContent = generateMockDataFileContent(templates);

    // Create a downloadable file
    const blob = new Blob([mockDataContent], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);

    // Auto-download the file
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mockTemplatesWithFields.ts';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `Successfully exported ${templates.length} templates. Replace src/data/mockTemplatesWithFields.ts with the downloaded file.`,
      templatesCount: templates.length,
    };
  } catch (error) {
    return {
      success: false,
      message:
        'Failed to export templates: ' + (error instanceof Error ? error.message : 'Unknown error'),
      templatesCount: 0,
      errors: [String(error)],
    };
  }
};

const generateMockDataFileContent = (templates: ClassTemplate[]): string => {
  let content = `import { ClassTemplate, Organization, TrialType, TemplateStatus, TemplateType } from '@/types/template.types';
import { TemplateFieldConfiguration, TrialTypeField } from '@/types/field-definition-types';

// Auto-generated from localStorage templates
// Generated at: ${new Date().toISOString()}

`;

  const exportNames: string[] = [];

  // Generate individual template exports
  templates.forEach(template => {
    const safeName = generateSafeConstantName(template.templateName);
    exportNames.push(safeName);

    content += `export const ${safeName}: ClassTemplate = ${formatTemplateForTypeScript(template)};

`;
  });

  // Generate the STRUCTURED_TEMPLATES export
  content += `// Export all templates
export const STRUCTURED_TEMPLATES = [
`;
  exportNames.forEach(name => {
    content += `  ${name},\n`;
  });
  content += `];
`;

  return content;
};

const generateSafeConstantName = (templateName: string): string => {
  return (
    templateName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') + '_TEMPLATE'
  );
};

const formatTemplateForTypeScript = (template: ClassTemplate): string => {
  // Create a clean copy and format for TypeScript
  const formatted = {
    ...template,
    // Convert string enums to proper enum references
    organization: `Organization.${template.organization.toUpperCase().replace(/\s+/g, '_')}`,
    trialType: `TrialType.${template.trialType.toUpperCase().replace(/\s+/g, '_')}`,
    status: template.status
      ? `TemplateStatus.${template.status.toUpperCase()}`
      : 'TemplateStatus.ACTIVE',
    type: template.type ? `TemplateType.${template.type.toUpperCase()}` : 'TemplateType.CUSTOM',
    // Format dates
    createdAt: `new Date('${template.createdAt}')`,
    updatedAt: `new Date('${template.updatedAt}')`,
  };

  // Convert to JSON string and then fix enum references and strings
  let jsonString = JSON.stringify(formatted, null, 2);

  // Fix enum references (remove quotes)
  jsonString = jsonString.replace(
    /"(Organization|TrialType|TemplateStatus|TemplateType)\.[A-Z_]+"/g,
    '$1'
  );

  // Fix date objects (remove quotes)
  jsonString = jsonString.replace(/"new Date\('([^']+)'\)"/g, "new Date('$1')");

  // Fix string escaping for apostrophes
  jsonString = jsonString.replace(/([^\\])'/g, "$1\\'");

  return jsonString;
};

// Browser console helper
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).autoSaveTemplatesToMockData =
    autoSaveTemplatesToMockData;
}
