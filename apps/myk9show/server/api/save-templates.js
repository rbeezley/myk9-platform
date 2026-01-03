import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { templates } = req.body;

    if (!templates || !Array.isArray(templates)) {
      return res.status(400).json({ error: 'Invalid templates data' });
    }

    // Generate the file content
    const fileContent = generateMockDataFileContent(templates);

    // Path to the mock data file
    const mockDataPath = path.resolve(__dirname, '../../src/data/mockTemplatesWithFields.ts');

    // Write the file
    fs.writeFileSync(mockDataPath, fileContent, 'utf8');

    res.json({ 
      success: true, 
      message: `Successfully saved ${templates.length} templates to mockTemplatesWithFields.ts`,
      templatesCount: templates.length
    });

  } catch (error) {
    console.error('Error saving templates:', error);
    res.status(500).json({ 
      error: 'Failed to save templates', 
      details: error.message 
    });
  }
}

function generateMockDataFileContent(templates) {
  let content = `import { ClassTemplate, Organization, ShowType, TemplateStatus, TemplateType } from '@/types/template.types';
import { TemplateFieldConfiguration, ShowTypeField } from '@/types/field-definition-types';

// Auto-generated from localStorage templates
// Generated at: ${new Date().toISOString()}
// Templates: ${templates.length}

`;

  const exportNames = [];

  // Generate individual template exports
  templates.forEach((template, index) => {
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
}

function generateSafeConstantName(templateName) {
  return templateName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') + '_TEMPLATE';
}

function formatTemplateForTypeScript(template) {
  // Create a clean copy
  const formatted = { ...template };
  
  // Convert enum strings to proper enum references
  const organizationMap = {
    'AKC': 'Organization.AKC',
    'UKC': 'Organization.UKC',
    'CKC': 'Organization.CKC'
  };
  
  const showTypeMap = {
    'Scent Work': 'ShowType.SCENT_WORK',
    'Agility': 'ShowType.AGILITY', 
    'Conformation': 'ShowType.CONFORMATION',
    'Obedience': 'ShowType.OBEDIENCE',
    'Rally': 'ShowType.RALLY'
  };
  
  const statusMap = {
    'active': 'TemplateStatus.ACTIVE',
    'draft': 'TemplateStatus.DRAFT',
    'archived': 'TemplateStatus.ARCHIVED',
    'deprecated': 'TemplateStatus.DEPRECATED'
  };
  
  const typeMap = {
    'official': 'TemplateType.OFFICIAL',
    'custom': 'TemplateType.CUSTOM',
    'fork': 'TemplateType.FORK'
  };

  // Replace with enum references
  formatted.organization = organizationMap[template.organization] || `Organization.${template.organization.toUpperCase().replace(/\s+/g, '_')}`;
  formatted.showType = showTypeMap[template.showType] || `ShowType.${template.showType.toUpperCase().replace(/\s+/g, '_')}`;
  
  if (template.status) {
    formatted.status = statusMap[template.status] || `TemplateStatus.${template.status.toUpperCase()}`;
  }
  
  if (template.type) {
    formatted.type = typeMap[template.type] || `TemplateType.${template.type.toUpperCase()}`;
  }

  // Format dates
  if (template.createdAt) {
    formatted.createdAt = `new Date('${template.createdAt}')`;
  }
  if (template.updatedAt) {
    formatted.updatedAt = `new Date('${template.updatedAt}')`;
  }

  // Convert to JSON string
  let jsonString = JSON.stringify(formatted, null, 2);
  
  // Fix enum references (remove quotes around enum values)
  jsonString = jsonString.replace(/"(Organization|ShowType|TemplateStatus|TemplateType)\.[A-Z_]+"/g, '$1');
  
  // Fix date objects (remove quotes around new Date calls)
  jsonString = jsonString.replace(/"(new Date\([^)]+\))"/g, '$1');
  
  // Fix string escaping for apostrophes
  jsonString = jsonString.replace(/(?<!\\)'/g, "\\'");
  
  return jsonString;
}