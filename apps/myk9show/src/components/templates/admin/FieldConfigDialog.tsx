import React, { useState } from 'react';
import { TemplateFieldConfiguration, FieldDataType } from '@/types/field-definition-types';
import { msToDisplay, parseTimeInput } from '@/lib/timeUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldConfigDialogProps } from './FieldConfigurator.types';

function isDurationType(dataType: FieldDataType): boolean {
  return dataType === FieldDataType.DURATION || dataType === FieldDataType.DURATION_ARRAY;
}

export const FieldConfigDialog: React.FC<FieldConfigDialogProps> = ({
  field,
  config,
  open,
  onOpenChange,
  onSave,
}) => {
  const [localConfig, setLocalConfig] = useState<Partial<TemplateFieldConfiguration>>({
    required: config?.required ?? field.required ?? false,
    visible: config?.visible ?? true,
    editable: config?.editable ?? true,
    defaultValue: config?.defaultValue ?? field.defaultValue,
    displayOrder: config?.displayOrder ?? 1,
    defaultVariesByClass: config?.defaultVariesByClass ?? false,
    valueConstraints: config?.valueConstraints,
  });

  const handleSave = () => {
    onSave(localConfig);
  };

  const updateConstraint = (updates: Record<string, unknown>) => {
    setLocalConfig({
      ...localConfig,
      valueConstraints: {
        ...localConfig.valueConstraints,
        type: 'range' as const,
        ...updates,
      },
    });
  };

  const parseConstraintValue = (value: string): number | undefined => {
    if (!value) return undefined;
    if (isDurationType(field.dataType)) {
      return parseTimeInput(value).ms;
    }
    return Number(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {field.displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Toggle switches: required, visible, editable */}
          <ToggleRow
            id="required"
            label="Required Field"
            description="Users must fill this field when creating a class"
            checked={localConfig.required}
            onChange={checked => setLocalConfig({ ...localConfig, required: checked })}
          />

          <Separator />

          <ToggleRow
            id="visible"
            label="Visible"
            description="Show this field in the form"
            checked={localConfig.visible}
            onChange={checked => setLocalConfig({ ...localConfig, visible: checked })}
          />

          <ToggleRow
            id="editable"
            label="Editable"
            description="Allow users to modify this field"
            checked={localConfig.editable}
            onChange={checked => setLocalConfig({ ...localConfig, editable: checked })}
          />

          <Separator />

          {/* Default Value */}
          <FormField label="Default Value" fieldId="defaultValue" hint={field.dataType === FieldDataType.DURATION_ARRAY ? 'Time format: MM:SS (e.g., 1:30 for 1 minute 30 seconds)' : (field.unit ? `Unit: ${field.unit}` : undefined)}>
            <DefaultValueInput
              field={field}
              localConfig={localConfig}
              setLocalConfig={setLocalConfig}
            />
          </FormField>

          <ToggleRow
            id="defaultVariesByClass"
            label="Default varies by class"
            description="Allow different default values for each class in the template"
            checked={localConfig.defaultVariesByClass}
            onChange={checked => setLocalConfig({ ...localConfig, defaultVariesByClass: checked })}
          />

          {/* Value Constraints */}
          {(field.dataType === FieldDataType.NUMBER ||
            field.dataType === FieldDataType.CURRENCY ||
            isDurationType(field.dataType)) && (
            <div className="space-y-2">
              <Label>Value Constraints (Optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <FormField label={`Minimum ${isDurationType(field.dataType) ? '(MM:SS)' : ''}`} fieldId="minValue">
                  <Input
                    id="minValue"
                    type={isDurationType(field.dataType) ? 'text' : 'number'}
                    placeholder={isDurationType(field.dataType) ? '0:30' : 'No limit'}
                    value={
                      isDurationType(field.dataType) && localConfig.valueConstraints?.min
                        ? msToDisplay(localConfig.valueConstraints.min, 'seconds')
                        : localConfig.valueConstraints?.min || ''
                    }
                    onChange={e => updateConstraint({ min: parseConstraintValue(e.target.value) })}
                  />
                </FormField>
                <FormField label={`Maximum ${isDurationType(field.dataType) ? '(MM:SS)' : ''}`} fieldId="maxValue">
                  <Input
                    id="maxValue"
                    type={isDurationType(field.dataType) ? 'text' : 'number'}
                    placeholder={isDurationType(field.dataType) ? '3:00' : 'No limit'}
                    value={
                      isDurationType(field.dataType) && localConfig.valueConstraints?.max
                        ? msToDisplay(localConfig.valueConstraints.max, 'seconds')
                        : localConfig.valueConstraints?.max || ''
                    }
                    onChange={e => updateConstraint({ max: parseConstraintValue(e.target.value) })}
                  />
                </FormField>
              </div>
              <FormField label="Helper Text" fieldId="constraintHint">
                <Input
                  id="constraintHint"
                  placeholder="e.g., 'Judge sets within 1-3 minutes'"
                  value={localConfig.valueConstraints?.hint || ''}
                  onChange={e => updateConstraint({ hint: e.target.value })}
                />
              </FormField>
            </div>
          )}

          <Separator />

          <FormField label="Display Order" fieldId="displayOrder">
            <Input
              id="displayOrder"
              type="number"
              value={localConfig.displayOrder || 1}
              onChange={e =>
                setLocalConfig({ ...localConfig, displayOrder: parseInt(e.target.value) })
              }
              min={1}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- Internal sub-components ---

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean | undefined;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
    <p className="text-sm text-muted-foreground">{description}</p>
  </div>
);

interface DefaultValueInputProps {
  field: FieldConfigDialogProps['field'];
  localConfig: Partial<TemplateFieldConfiguration>;
  setLocalConfig: React.Dispatch<React.SetStateAction<Partial<TemplateFieldConfiguration>>>;
}

const DefaultValueInput: React.FC<DefaultValueInputProps> = ({
  field,
  localConfig,
  setLocalConfig,
}) => {
  if (field.dataType === FieldDataType.SELECT && field.options) {
    return (
      <Select
        value={String(localConfig.defaultValue || '__none__')}
        onValueChange={value =>
          setLocalConfig({
            ...localConfig,
            defaultValue: value === '__none__' ? undefined : value,
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Select default value" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No default</SelectItem>
          {field.options.map((option, index) => {
            const optionValue = typeof option === 'string' ? option : option.value;
            const optionLabel = typeof option === 'string' ? option : option.label;
            return (
              <SelectItem key={index} value={optionValue}>
                {optionLabel}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  if (field.dataType === FieldDataType.BOOLEAN) {
    return (
      <Select
        value={String(localConfig.defaultValue || 'false')}
        onValueChange={value => setLocalConfig({ ...localConfig, defaultValue: value === 'true' })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.dataType === FieldDataType.DURATION) {
    return (
      <Input
        id="defaultValue"
        type="text"
        value={
          typeof localConfig.defaultValue === 'number'
            ? msToDisplay(localConfig.defaultValue, 'seconds')
            : String(localConfig.defaultValue || '')
        }
        onChange={e => {
          const parsed = parseTimeInput(e.target.value);
          if (parsed.isValid && parsed.ms !== undefined) {
            setLocalConfig({ ...localConfig, defaultValue: parsed.ms });
          } else {
            setLocalConfig({ ...localConfig, defaultValue: e.target.value });
          }
        }}
        placeholder="MM:SS (e.g., 1:30)"
      />
    );
  }

  if (field.dataType === FieldDataType.DURATION_ARRAY) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Default time limits for multiple search areas. Actual count will be set by "Number of
          Search Areas" field.
        </p>
        <Input
          id="defaultValue"
          type="text"
          value={
            Array.isArray(localConfig.defaultValue)
              ? localConfig.defaultValue.map(ms => msToDisplay(ms as number, 'seconds')).join(', ')
              : String(localConfig.defaultValue || '3:00')
          }
          onChange={e => {
            const timeStrings = e.target.value.split(',').map(s => s.trim());
            const timesMs: number[] = [];
            let allValid = true;

            for (const timeStr of timeStrings) {
              if (timeStr) {
                const parsed = parseTimeInput(timeStr);
                if (parsed.isValid && parsed.ms !== undefined) {
                  timesMs.push(parsed.ms);
                } else {
                  allValid = false;
                  break;
                }
              }
            }

            if (allValid && timesMs.length > 0) {
              setLocalConfig({ ...localConfig, defaultValue: timesMs });
            } else {
              setLocalConfig({ ...localConfig, defaultValue: e.target.value });
            }
          }}
          placeholder="3:00, 4:00, 2:30 (comma-separated)"
        />
      </div>
    );
  }

  if (field.dataType === FieldDataType.NUMBER || field.dataType === FieldDataType.CURRENCY) {
    return (
      <Input
        id="defaultValue"
        type="number"
        value={String(localConfig.defaultValue || '')}
        onChange={e =>
          setLocalConfig({
            ...localConfig,
            defaultValue: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        placeholder={`Default: ${field.defaultValue || '0'}`}
        step={field.dataType === FieldDataType.CURRENCY ? '0.01' : '1'}
        min={field.minValue}
        max={field.maxValue}
      />
    );
  }

  return (
    <Input
      id="defaultValue"
      value={String(localConfig.defaultValue || '')}
      onChange={e => setLocalConfig({ ...localConfig, defaultValue: e.target.value })}
      placeholder={`Default: ${field.defaultValue || 'None'}`}
    />
  );
};
