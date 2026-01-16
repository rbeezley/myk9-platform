import React, { useState, useEffect } from 'react';
import { ClassTemplate } from '@/types/template.types';
import { 
  TemplateFieldConfiguration, 
  FieldDefinition, 
  ClassFieldValues,
  FieldDataType,
  ShowTypeField
} from '@/types/field-definition-types';
import {
  getConfiguredFieldsWithDefinitions,
  validateFieldValuesWithConstraints,
  getDefaultFieldValues,
  generateClassName,
  groupFieldsByCategory,
  formatRangeConstraint,
  hasValueConstraints
} from '@/lib/fieldUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { AlertCircle, Save, RefreshCw } from 'lucide-react';
import { msToDisplay, parseTimeInput } from '@/lib/timeUtils';
import DynamicSearchTimeLimits from './DynamicSearchTimeLimits';

interface DynamicClassFormProps {
  template: ClassTemplate;
  initialValues?: Partial<ClassFieldValues>;
  onSave: (values: ClassFieldValues) => void;
  onCancel?: () => void;
  readOnly?: boolean;
  className?: string;
}

export const DynamicClassForm: React.FC<DynamicClassFormProps> = ({
  template,
  initialValues = {},
  onSave,
  onCancel,
  readOnly = false,
  className = ''
}) => {
  // Get configured fields with definitions
  const configuredFields = getConfiguredFieldsWithDefinitions(template);
  const visibleFields = configuredFields.filter(field => field.visible);
  
  // Initialize form values
  const [values, setValues] = useState<ClassFieldValues>(() => {
    const defaults = getDefaultFieldValues(template);
    return { ...defaults, ...initialValues };
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  
  // Auto-generate class name when relevant fields change
  useEffect(() => {
    if (!values.className && (values.element || values.level || values.section)) {
      const generated = generateClassName(values);
      setValues(prev => ({ ...prev, className: generated }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.element, values.level, values.section, values.division, values.className]);
  
  // Auto-calculate estimated duration based on entries × judging time + setup time
  useEffect(() => {
    const currentEntries = Number(values.currentEntries) || 0;
    const judgingTime = values.estimatedJudgingTime;
    const setupTime = Number(values.classSetupTime) || 0;
    
    if ((currentEntries > 0 && judgingTime) || setupTime > 0) {
      let totalMinutes = setupTime; // Start with setup time
      
      if (currentEntries > 0 && judgingTime) {
        // Convert judging time to minutes
        if (typeof judgingTime === 'string' && judgingTime.includes(':')) {
          // Format: MM:SS
          const [minutes, seconds] = judgingTime.split(':').map(Number);
          const judgingMinutes = (minutes || 0) + (seconds || 0) / 60;
          totalMinutes += currentEntries * judgingMinutes;
        } else if (typeof judgingTime === 'number') {
          // Already in seconds, convert to minutes
          totalMinutes += currentEntries * (judgingTime / 60);
        }
      }
      
      // Round to nearest 5 minutes for cleaner display
      const roundedMinutes = Math.ceil(totalMinutes / 5) * 5;
      
      // Update estimated duration if it's different
      if (values.estimatedDuration !== roundedMinutes) {
        setValues(prev => ({ ...prev, estimatedDuration: roundedMinutes }));
      }
    }
  }, [values.currentEntries, values.estimatedJudgingTime, values.classSetupTime, values.estimatedDuration]);
  
  // Validate form
  const validateForm = () => {
    setIsValidating(true);
    const validation = validateFieldValuesWithConstraints(values, template);
    setErrors(validation.errors);
    setIsValidating(false);
    return validation.isValid;
  };
  
  // Handle field value change
  const handleFieldChange = (fieldName: string, value: unknown) => {
    if (readOnly) return;
    
    setValues(prev => ({ ...prev, [fieldName]: value }));
    
    // Clear error for this field
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };
  
  // Handle form submission
  const handleSave = () => {
    if (validateForm()) {
      onSave(values);
    }
  };
  
  // Reset form to defaults
  const handleReset = () => {
    if (readOnly) return;
    const defaults = getDefaultFieldValues(template);
    setValues({ ...defaults, ...initialValues });
    setErrors({});
  };
  
  // Render field based on type
  const renderField = (field: FieldDefinition & TemplateFieldConfiguration) => {
    const value = values[field.fieldName];
    const error = errors[field.fieldName];
    
    // Make estimatedDuration read-only when currentEntries > 0 or setupTime > 0
    const isCalculatedDuration = field.fieldName === ShowTypeField.ESTIMATED_DURATION && 
                                (Number(values.currentEntries) > 0 || Number(values.classSetupTime) > 0);
    const disabled = readOnly || !field.editable || isCalculatedDuration;
    
    const fieldId = `field-${field.fieldName}`;
    
    const commonProps = {
      id: fieldId,
      disabled,
      className: error ? 'border-red-500' : undefined
    };
    
    const renderFieldInput = () => {
      switch (field.dataType) {
        case FieldDataType.STRING:
          return (
            <Input
              {...commonProps}
              value={String(value || '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
              placeholder={String(field.defaultValue || `Enter ${field.displayName.toLowerCase()}`)}
            />
          );
          
        case FieldDataType.NUMBER:
        case FieldDataType.CURRENCY:
          return (
            <Input
              {...commonProps}
              type="number"
              value={String(value || '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value ? Number(e.target.value) : undefined)}
              placeholder={String(field.defaultValue) || '0'}
              min={field.minValue}
              max={field.maxValue}
              step={field.dataType === FieldDataType.CURRENCY ? '0.01' : '1'}
            />
          );
          
        case FieldDataType.BOOLEAN:
          return (
            <div className="flex items-center space-x-2">
              <Switch
                {...commonProps}
                checked={Boolean(value)}
                onCheckedChange={(checked) => handleFieldChange(field.fieldName, checked)}
              />
              <Label htmlFor={fieldId} className="text-sm font-normal">
                {value ? 'Yes' : 'No'}
              </Label>
            </div>
          );
          
        case FieldDataType.DATE:
          return (
            <DatePicker
              date={value ? new Date(value as string | number | Date) : undefined}
              setDate={(date) => handleFieldChange(field.fieldName, date)}
              disabled={disabled}
            />
          );
          
        case FieldDataType.TIME:
          return (
            <Input
              {...commonProps}
              type="time"
              value={String(value || '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            />
          );
          
        case FieldDataType.DURATION: {
          // Handle time duration in MM:SS format, stored as milliseconds
          const currentDurationValue = typeof value === 'number' 
            ? msToDisplay(value, 'seconds') 
            : String(value || '');
            
          return (
            <Input
              {...commonProps}
              type="text"
              value={currentDurationValue}
              onChange={(e) => {
                const parsed = parseTimeInput(e.target.value);
                if (parsed.isValid && parsed.ms !== undefined) {
                  handleFieldChange(field.fieldName, parsed.ms);
                } else {
                  // Allow partial input while typing
                  handleFieldChange(field.fieldName, e.target.value);
                }
              }}
              placeholder="MM:SS (e.g., 3:00)"
            />
          );
        }
          
        case FieldDataType.DURATION_ARRAY: {
          // Handle array of time durations for multiple search areas
          const searchAreasCount = Number(values[ShowTypeField.SEARCH_AREAS]) || 1;
          const currentTimeLimits = Array.isArray(value) ? value as number[] : [180000]; // Default 3:00
          
          return (
            <DynamicSearchTimeLimits
              searchAreasCount={searchAreasCount}
              timeLimits={currentTimeLimits}
              onChange={(newTimeLimits) => handleFieldChange(field.fieldName, newTimeLimits)}
              readOnly={disabled}
              minTime={field.minValue}
              maxTime={field.maxValue}
            />
          );
        }
          
        case FieldDataType.TEXT:
          return (
            <Textarea
              {...commonProps}
              value={String(value || '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
              placeholder={String(field.defaultValue || `Enter ${field.displayName.toLowerCase()}`)}
              rows={3}
            />
          );
          
        case FieldDataType.SELECT: {
          const selectOptions = field.overrideOptions || field.options || [];
          return (
            <Select
              value={String(value || '')}
              onValueChange={(newValue) => handleFieldChange(field.fieldName, newValue)}
              disabled={disabled}
            >
              <SelectTrigger className={error ? 'border-red-500' : ''}>
                <SelectValue placeholder={`Select ${field.displayName.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.map((option, index) => {
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
          
        case FieldDataType.MULTI_SELECT:
          // TODO: Implement multi-select component
          return (
            <Input
              {...commonProps}
              value={Array.isArray(value) ? value.join(', ') : String(value || '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value.split(',').map(v => v.trim()))}
              placeholder="Enter comma-separated values"
            />
          );
          
        default:
          return (
            <Input
              {...commonProps}
              value={String(value || '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
              placeholder={String(field.defaultValue || `Enter ${field.displayName.toLowerCase()}`)}
            />
          );
      }
    };
    
    return (
      <div key={field.fieldName} className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={fieldId} className="text-sm font-medium">
            {field.displayName}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {field.unit && (
            <Badge variant="outline" className="text-xs">
              {field.unit}
            </Badge>
          )}
          {!field.editable && (
            <Badge variant="secondary" className="text-xs">
              Read-only
            </Badge>
          )}
          {isCalculatedDuration && (
            <Badge variant="default" className="text-xs">
              Auto-calculated
            </Badge>
          )}
          {hasValueConstraints(field) && (
            <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
              Constrained
            </Badge>
          )}
        </div>
        
        {renderFieldInput()}
        
        {/* Field description or constraint hint */}
        {(field.description || hasValueConstraints(field)) && (
          <div className="space-y-1">
            {field.description && (
              <p className="text-xs text-muted-foreground">
                {isCalculatedDuration 
                  ? `Calculated as: (${values.currentEntries || 0} entries × ${values.estimatedJudgingTime || '0:00'} per entry) + ${values.classSetupTime || 0} min setup`
                  : field.description
                }
              </p>
            )}
            {hasValueConstraints(field) && field.valueConstraints && (
              <p className="text-xs text-blue-600 font-medium">
                {formatRangeConstraint(field.valueConstraints, field.dataType)}
              </p>
            )}
          </div>
        )}
        
        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>
    );
  };
  
  // Group fields by category
  const groupedFields = groupFieldsByCategory(visibleFields);
  
  // Show message if no fields configured
  if (visibleFields.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No fields have been configured for this template. Please configure fields in the template editor.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Form Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Class Information</h3>
          <p className="text-sm text-muted-foreground">
            {template.templateName} - {template.showType}
          </p>
        </div>
        
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        )}
      </div>
      
      {/* Validation Summary */}
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please correct {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''} below.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Form Fields */}
      <div className="space-y-6">
        {Object.entries(groupedFields).map(([categoryName, categoryFields]) => (
          <Card key={categoryName}>
            <CardHeader>
              <CardTitle className="text-base">{categoryName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categoryFields
                  .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                  .map(field => renderField(field))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Form Actions */}
      {!readOnly && (
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={isValidating}>
            {isValidating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Class
          </Button>
        </div>
      )}
    </div>
  );
};