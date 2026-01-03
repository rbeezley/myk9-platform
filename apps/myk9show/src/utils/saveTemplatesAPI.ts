/**
 * API utility to save templates directly to the mockTemplatesWithFields.ts file
 */

import { ClassTemplate } from '@/types/template.types';

interface SaveTemplatesResponse {
  success: boolean;
  message: string;
  templatesCount: number;
  error?: string;
  details?: string;
}

export const saveTemplatesToFile = async (templates: ClassTemplate[]): Promise<SaveTemplatesResponse> => {
  try {
    const response = await fetch('/api/save-templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ templates }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      message: 'Failed to save templates to file',
      templatesCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const saveTemplatesFromLocalStorage = async (): Promise<SaveTemplatesResponse> => {
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

    return await saveTemplatesToFile(templates);
  } catch (error) {
    return {
      success: false,
      message: 'Failed to read templates from localStorage',
      templatesCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};