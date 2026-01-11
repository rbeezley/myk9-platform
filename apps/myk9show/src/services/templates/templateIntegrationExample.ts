/* eslint-disable react-hooks/rules-of-hooks */
// Template System Integration Example
// Note: This is an example file with React Hook usage that violates rules - for demonstration only
// Phase 4.1: Template System Integration
// This file demonstrates how to use the complete template system

import { logger } from '@/services/LoggingService';
import { 
  useClassTemplatesQuery,
  useCreateClassTemplateMutation,
  useTrackShowTemplateUsageMutation,
  // useTemplateFieldsQuery, // Unused in this example file
  useCreateTemplateFieldsMutation,
} from '@/hooks/queries/useTemplatesDatabase';
import {
  mapClassTemplateToInsert,
  mapClassTemplateFieldToInsert,
  generateClassesFromTemplate,
} from '@/services/mappers/templateMappers';
import {
  createInheritedTemplate,
  createTemplateVariant,
  validateInheritance,
} from '@/services/templates/templateInheritance';
import {
  createTemplateVersion,
  trackTemplateUsage,
  getTemplateUsageStats,
} from '@/services/templates/templateVersioning';
import type { ClassTemplate, ClassTemplateField } from '@/types/class-template-types';

// ===== EXAMPLE 1: Creating a New Template =====

/**
 * Example: Create a custom UKC Agility template
 */
export const createUKCAgilityTemplate = async () => {
  const createTemplateMutation = useCreateClassTemplateMutation();
  const createFieldsMutation = useCreateTemplateFieldsMutation();

  // Define the template
  const template: Omit<ClassTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'UKC Agility Standard',
    organization: 'UKC',
    showType: 'Agility',
    description: 'United Kennel Club Standard Agility classes',
    fields: [
      {
        name: 'level',
        type: 'level',
        values: ['Novice', 'Started', 'Advanced', 'Championship'],
        optional: false,
      },
      {
        name: 'jumpHeight',
        type: 'custom',
        values: ['8"', '12"', '16"', '20"', '24"'],
        optional: false,
      },
      {
        name: 'division',
        type: 'section',
        values: ['A', 'B'],
        optional: true,
      }
    ],
    classPattern: 'UKC {level} Agility {jumpHeight} {division}',
    entryFeeDefault: 22,
    maxEntriesDefault: 250,
    requiresJumpHeight: true,
  };

  try {
    // Create the template in the database
    const dbTemplate = mapClassTemplateToInsert(template);
    const createdTemplate = await createTemplateMutation.mutateAsync(dbTemplate);
    
    if (createdTemplate) {
      // Create the template fields
      const fieldInserts = template.fields.map((field, index) => 
        mapClassTemplateFieldToInsert(field, createdTemplate.id, index)
      );
      
      await createFieldsMutation.mutateAsync(fieldInserts);

      logger.info('UKC Agility template created successfully', 'templates', { templateId: createdTemplate.id });
      return createdTemplate;
    }
  } catch (error) {
    logger.error('Failed to create UKC Agility template', 'templates', {}, error as Error);
    throw error;
  }
};

// ===== EXAMPLE 2: Template Inheritance =====

/**
 * Example: Create a specialized AKC Scent Work template for competitions
 */
export const createCompetitiveAKCScentWorkTemplate = (parentTemplate: ClassTemplate) => {
  // Create a variant with additional competitive features
  const competitiveTemplate = createTemplateVariant(
    parentTemplate,
    'Competition Ready',
    {
      fieldModifications: {
        level: {
          values: ['Excellent', 'Masters'], // Focus on higher levels
          optional: false,
        }
      },
      additionalFields: [
        {
          name: 'championship',
          type: 'custom',
          values: ['Regional', 'National', 'Invitational'],
          optional: true,
        },
        {
          name: 'searchTime',
          type: 'custom',
          values: ['3:00', '4:00', '5:00'],
          optional: true,
        }
      ],
      patternOverride: '{element} {level} {championship} {section}',
      defaultOverrides: {
        entryFeeDefault: 45, // Higher fee for competitive events
        maxEntriesDefault: 30, // Smaller classes for competitive events
      }
    }
  );

  // Validate the inheritance
  const validation = validateInheritance(parentTemplate, competitiveTemplate);
  if (!validation.isValid) {
    throw new Error(`Template inheritance validation failed: ${validation.errors.join(', ')}`);
  }

  return competitiveTemplate;
};

// ===== EXAMPLE 3: Template Usage and Analytics =====

/**
 * Example: Track and analyze template usage
 */
export const analyzeTemplateUsage = async (templateId: string) => {
  const trackUsageMutation = useTrackShowTemplateUsageMutation();
  
  // Track that this template was used to create a show
  await trackUsageMutation.mutateAsync(templateId);
  
  // Create usage record for analytics
  const usageRecord = trackTemplateUsage(
    templateId,
    'user-123', // Current user ID
    'create_show',
    {
      showName: 'Spring Scent Work Trial',
      location: 'Training Center',
      expectedParticipants: 150,
    }
  );

  // Get usage statistics (in a real app, this would come from the database)
  const mockUsageRecords = [usageRecord]; // This would be fetched from database
  const stats = getTemplateUsageStats(templateId, mockUsageRecords);

  logger.info('Template Usage Statistics', 'templates', {
    totalUsage: stats.totalUsage,
    popularityScore: stats.popularityScore,
    usageByType: stats.usageByType,
  });

  return stats;
};

// ===== EXAMPLE 4: Template Versioning =====

/**
 * Example: Update a template and create a new version
 */
export const updateTemplateWithVersioning = async (
  currentTemplate: ClassTemplate,
  updates: Partial<ClassTemplate>
) => {
  // Create the updated template
  const updatedTemplate: ClassTemplate = {
    ...currentTemplate,
    ...updates,
    updatedAt: new Date(),
  };

  // Create a version record to track changes
  const version = createTemplateVersion(
    currentTemplate,
    updatedTemplate,
    'semantic',
    'user-123', // Current user
    'Updated template with new competition fields'
  );

  logger.info('Template Version Created', 'templates', {
    version: version.version,
    changeCount: version.changes.length,
    changes: version.changes.map(c => c.description),
  });

  return { updatedTemplate, version };
};

// ===== EXAMPLE 5: Generating Classes from Template =====

/**
 * Example: Generate classes from a template for a show
 */
export const generateShowClasses = (template: ClassTemplate) => {
  // Generate all possible classes from the template
  const generatedClasses = generateClassesFromTemplate(template);

  logger.info('Generated classes from template', 'templates', {
    templateName: template.name,
    classCount: generatedClasses.length,
  });

  generatedClasses.forEach((generatedClass, index) => {
    logger.debug('Generated class', 'templates', {
      index: index + 1,
      className: generatedClass.className,
      entryFee: generatedClass.entryFee,
      maxEntries: generatedClass.maxEntries,
      element: generatedClass.element,
      level: generatedClass.level,
      section: generatedClass.section,
    });
  });

  return generatedClasses;
};

// ===== EXAMPLE 6: Template Selection and Filtering =====

/**
 * Example: Find appropriate templates for a specific organization and show type
 */
export const findTemplatesForShow = (organization: string, showType: string) => {
  const { data: templates, isLoading, error } = useClassTemplatesQuery();

  if (isLoading) return { templates: [], isLoading: true };
  if (error) return { templates: [], error };

  // Filter templates by organization and show type
  const filteredTemplates = templates?.filter(template => 
    template.organization === organization && 
    template.show_type === showType &&
    template.is_active
  ) || [];

  // Sort by usage popularity (if we had usage data)
  const sortedTemplates = filteredTemplates.sort((a, b) => {
    // In a real implementation, this would sort by actual usage statistics
    return a.name.localeCompare(b.name);
  });

  logger.info('Found templates for organization', 'templates', {
    organization,
    showType,
    count: sortedTemplates.length,
    templateNames: sortedTemplates.map(t => t.name),
  });

  return { templates: sortedTemplates, isLoading: false };
};

// ===== EXAMPLE 7: Template Customization for Show Secretary =====

/**
 * Example: How a show secretary would customize a template for their specific needs
 */
export const customizeTemplateForShow = (
  baseTemplate: ClassTemplate,
  showCustomizations: {
    entryFee?: number;
    maxEntries?: number;
    additionalFields?: ClassTemplateField[];
    removedFields?: string[];
  }
) => {
  // Create a customized version of the template
  const customTemplate = createInheritedTemplate(baseTemplate, {
    parentId: baseTemplate.id,
    childOverrides: {
      id: `${baseTemplate.id}_custom_${Date.now()}`,
      name: `${baseTemplate.name} (Custom)`,
      entryFeeDefault: showCustomizations.entryFee || baseTemplate.entryFeeDefault,
      maxEntriesDefault: showCustomizations.maxEntries || baseTemplate.maxEntriesDefault,
    },
    fieldOverrides: {},
    addedFields: showCustomizations.additionalFields || [],
    removedFields: showCustomizations.removedFields || [],
  });

  logger.info('Customized template created', 'templates', {
    originalName: baseTemplate.name,
    customName: customTemplate.name,
    fieldCount: customTemplate.fields.length,
    entryFee: customTemplate.entryFeeDefault,
  });

  return customTemplate;
};

// ===== EXAMPLE 8: Complete Workflow =====

/**
 * Example: Complete workflow from template selection to class creation
 */
export const completeTemplateWorkflow = async () => {
  logger.info('Template System Integration Example started', 'templates');

  try {
    // Step 1: Find appropriate templates
    const { templates } = findTemplatesForShow('AKC', 'Scent Work');
    if (templates.length === 0) {
      throw new Error('No templates found for AKC Scent Work');
    }

    // Step 2: Select the first template
    const selectedTemplate = templates[0];
    logger.info('Selected template', 'templates', { templateName: selectedTemplate.name });

    // Step 3: Customize the template for our show
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customTemplate = customizeTemplateForShow(selectedTemplate as any, {
      entryFee: 35,
      maxEntries: 35,
      additionalFields: [
        {
          name: 'trial_number',
          type: 'custom',
          values: ['Trial 1', 'Trial 2'],
          optional: true,
        }
      ],
    });

    // Step 4: Generate classes from the customized template
    const classes = generateShowClasses(customTemplate);

    // Step 5: Track template usage
    await analyzeTemplateUsage(selectedTemplate.id);

    // Step 6: Create a new version if significant changes were made
    const { version } = await updateTemplateWithVersioning(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selectedTemplate as any,
      { description: 'Updated for spring trials' }
    );

    logger.info('Template workflow complete', 'templates');
    return {
      template: customTemplate,
      classes,
      version,
      success: true,
    };

  } catch (error) {
    logger.error('Template workflow failed', 'templates', {}, error as Error);
    return { success: false, error };
  }
};

// Export all examples for use in components or documentation
export const templateExamples = {
  createUKCAgilityTemplate,
  createCompetitiveAKCScentWorkTemplate,
  analyzeTemplateUsage,
  updateTemplateWithVersioning,
  generateShowClasses,
  findTemplatesForShow,
  customizeTemplateForShow,
  completeTemplateWorkflow,
};