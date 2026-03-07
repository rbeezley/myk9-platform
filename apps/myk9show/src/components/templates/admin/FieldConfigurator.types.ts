import { ClassTemplate } from '@/types/template.types';
import {
  TemplateFieldConfiguration,
  FieldDefinition,
  FieldCategory,
} from '@/types/field-definition-types';

export interface FieldConfiguratorProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export interface FieldConfigDialogProps {
  field: FieldDefinition;
  config?: TemplateFieldConfiguration | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<TemplateFieldConfiguration>) => void;
}

export interface FieldCardProps {
  field: FieldDefinition;
  isConfigured: boolean;
  config: TemplateFieldConfiguration | undefined;
  readOnly: boolean;
  onToggle: (field: FieldDefinition) => void;
  onConfigure: (field: FieldDefinition) => void;
}

export type CategoryFilter = FieldCategory | 'all';
