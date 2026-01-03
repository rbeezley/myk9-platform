import fs from 'fs';
import path from 'path';

export function saveTemplatesPlugin() {
  return {
    name: 'save-templates',
    configureServer(server) {
      server.middlewares.use('/api/save-templates', (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            const { templates } = JSON.parse(body);

            if (!templates || !Array.isArray(templates)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid templates data' }));
              return;
            }

            // Generate the file content
            const fileContent = generateMockDataFileContent(templates);

            // Path to the mock data file (relative to project root)
            const mockDataPath = path.resolve(process.cwd(), 'src/data/mockTemplatesWithFields.ts');

            // Write the file
            fs.writeFileSync(mockDataPath, fileContent, 'utf8');

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              success: true, 
              message: `Successfully saved ${templates.length} templates to mockTemplatesWithFields.ts`,
              templatesCount: templates.length
            }));

          } catch (error) {
            console.error('Error saving templates:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ 
              error: 'Failed to save templates', 
              details: error.message 
            }));
          }
        });
      });
    }
  };
}

function generateMockDataFileContent(templates) {
  let content = `import { ClassTemplate } from '@/types/template.types';

// Auto-generated from localStorage templates
// Generated at: ${new Date().toISOString()}
// Templates saved: ${templates.length}

`;

  // For now, just export a simplified array to avoid complex type issues
  content += `// Export all templates
export const STRUCTURED_TEMPLATES: ClassTemplate[] = ${JSON.stringify(templates, null, 2)
    .replace(/"([^"]+)":/g, '$1:') // Remove quotes from object keys
    .replace(/: "([^"]*Organization\.[^"]*)"([,\n\r\s]*)/g, ': $1$2') // Fix enum refs
    .replace(/: "([^"]*ShowType\.[^"]*)"([,\n\r\s]*)/g, ': $1$2')
    .replace(/: "([^"]*TemplateStatus\.[^"]*)"([,\n\r\s]*)/g, ': $1$2')
    .replace(/: "([^"]*TemplateType\.[^"]*)"([,\n\r\s]*)/g, ': $1$2')
    .replace(/"new Date\(([^)]+)\)"/g, 'new Date($1)') // Fix dates
  };
`;

  return content;
}

