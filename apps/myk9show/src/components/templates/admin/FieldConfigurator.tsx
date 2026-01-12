import React, { useState, useMemo } from 'react';
import { ClassTemplate, ShowType } from '@/types/template.types';
import { 
  TemplateFieldConfiguration, 
  FieldDefinition, 
  FieldCategory,
  ShowTypeField,
  FieldDataType
} from '@/types/field-definition-types';
import { getFieldsForShowType } from '@/data/fieldDefinitions';
import { 
  msToDisplay, 
  parseTimeInput 
} from '@/lib/timeUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  EyeOff,
  Settings,
  Lock,
  Search
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FieldConfiguratorProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export const FieldConfigurator: React.FC<FieldConfiguratorProps> = ({
  template,
  onChange,
  readOnly = false
}) => {
  const [selectedCategory, setSelectedCategory] = useState<FieldCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<FieldDefinition | null>(null);

  // Get current field configurations or initialize empty
  const fieldConfigs = template.fieldConfigurations || [];

  // Get available fields for this show type
  const availableFields = useMemo(() => {
    if (!template.showType) return [];
    return getFieldsForShowType(template.showType as ShowType);
  }, [template.showType]);

  // Filter fields by category and search
  const filteredFields = useMemo(() => {
    let fields = availableFields;

    if (selectedCategory !== 'all') {
      fields = fields.filter(f => f.category === selectedCategory);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      fields = fields.filter(f => 
        f.displayName.toLowerCase().includes(term) ||
        f.fieldName.toLowerCase().includes(term) ||
        f.description?.toLowerCase().includes(term)
      );
    }

    return fields;
  }, [availableFields, selectedCategory, searchTerm]);

  // Group fields by category for display
  const fieldsByCategory = useMemo(() => {
    const grouped: Record<FieldCategory, FieldDefinition[]> = {
      [FieldCategory.IDENTITY]: [],
      [FieldCategory.SCHEDULING]: [],
      [FieldCategory.COMPETITION]: [],
      [FieldCategory.PERSONNEL]: [],
      [FieldCategory.FINANCIAL]: [],
      [FieldCategory.ADMINISTRATIVE]: []
    };

    filteredFields.forEach(field => {
      grouped[field.category].push(field);
    });

    return grouped;
  }, [filteredFields]);

  // Check if a field is configured
  const isFieldConfigured = (fieldName: ShowTypeField): boolean => {
    return fieldConfigs.some(config => config.fieldName === fieldName);
  };

  // Get field configuration
  const getFieldConfig = (fieldName: ShowTypeField): TemplateFieldConfiguration | undefined => {
    return fieldConfigs.find(config => config.fieldName === fieldName);
  };

  // Add or update field configuration
  const toggleField = (field: FieldDefinition) => {
    if (readOnly) return;

    const existingConfig = getFieldConfig(field.fieldName);
    
    if (existingConfig) {
      // Remove field
      const newConfigs = fieldConfigs.filter(c => c.fieldName !== field.fieldName);
      onChange({ fieldConfigurations: newConfigs });
    } else {
      // Add field with default configuration
      const newConfig: TemplateFieldConfiguration = {
        fieldName: field.fieldName,
        required: field.required || false,
        visible: true,
        editable: true,
        displayOrder: fieldConfigs.length + 1,
        defaultValue: field.defaultValue
      };
      onChange({ fieldConfigurations: [...fieldConfigs, newConfig] });
    }
  };

  // Open configuration dialog for a field
  const openFieldConfig = (field: FieldDefinition) => {
    if (readOnly) return;
    setSelectedField(field);
    setConfigDialogOpen(true);
  };

  // Update field configuration
  const updateFieldConfig = (fieldName: ShowTypeField, updates: Partial<TemplateFieldConfiguration>) => {
    const newConfigs = fieldConfigs.map(config => 
      config.fieldName === fieldName 
        ? { ...config, ...updates }
        : config
    );
    onChange({ fieldConfigurations: newConfigs });
  };

  // Render field card
  const renderFieldCard = (field: FieldDefinition) => {
    const isConfigured = isFieldConfigured(field.fieldName);
    const config = getFieldConfig(field.fieldName);

    return (
      <div
        key={field.id}
        className={`relative p-4 rounded-lg border transition-all cursor-pointer ${
          isConfigured 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => toggleField(field)}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h4 className="font-medium">{field.displayName}</h4>
            {field.description && (
              <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            {isConfigured && (
              <>
                {config?.required && (
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                )}
                {!config?.visible && (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                {!config?.editable && (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
              </>
            )}
            <div className={`w-5 h-5 rounded border-2 transition-colors ${
              isConfigured 
                ? 'bg-blue-500 border-blue-500' 
                : 'border-gray-300'
            }`}>
              {isConfigured && (
                <svg className="w-3 h-3 text-white m-auto" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-3">
          <Badge variant="outline" className="text-xs">
            {field.dataType}
          </Badge>
          {field.unit && (
            <Badge variant="outline" className="text-xs">
              {field.unit}
            </Badge>
          )}
          {isConfigured && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                openFieldConfig(field);
              }}
            >
              <Settings className="h-3 w-3 mr-1" />
              Configure
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Count configured fields by category
  const getConfiguredCount = (category: FieldCategory): number => {
    return availableFields
      .filter(f => f.category === category)
      .filter(f => isFieldConfigured(f.fieldName))
      .length;
  };

  // Get total fields by category
  const getTotalCount = (category: FieldCategory): number => {
    return availableFields.filter(f => f.category === category).length;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Field Configuration</h3>
        <p className="text-muted-foreground">
          Select which fields will be available for classes created from this template
        </p>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {fieldConfigs.length}
              </div>
              <div className="text-sm text-muted-foreground">Selected Fields</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {fieldConfigs.filter(c => c.required).length}
              </div>
              <div className="text-sm text-muted-foreground">Required</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {fieldConfigs.filter(c => c.conditionalRules?.length).length}
              </div>
              <div className="text-sm text-muted-foreground">Conditional</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {availableFields.length}
              </div>
              <div className="text-sm text-muted-foreground">Available</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as FieldCategory | 'all')}>
        <TabsList className="grid grid-cols-4 lg:grid-cols-7 w-full">
          <TabsTrigger value="all">
            All ({availableFields.length})
          </TabsTrigger>
          {Object.values(FieldCategory).map(category => (
            <TabsTrigger key={category} value={category}>
              <span className="hidden lg:inline">{category}</span>
              <span className="lg:hidden">{category.slice(0, 3)}</span>
              <Badge variant="outline" className="ml-2 text-xs">
                {getConfiguredCount(category)}/{getTotalCount(category)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-6">
          {selectedCategory === 'all' ? (
            <div className="space-y-6">
              {Object.entries(fieldsByCategory).map(([category, fields]) => 
                fields.length > 0 && (
                  <Card key={category}>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>{category}</span>
                        <Badge variant="outline">
                          {fields.filter(f => isFieldConfigured(f.fieldName)).length} / {fields.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3">
                        {fields.map(field => renderFieldCard(field))}
                      </div>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-3">
                  {fieldsByCategory[selectedCategory as FieldCategory].length > 0 ? (
                    fieldsByCategory[selectedCategory as FieldCategory].map(field => 
                      renderFieldCard(field)
                    )
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No fields found in this category
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Field Configuration Dialog */}
      {selectedField && (
        <FieldConfigDialog
          field={selectedField}
          config={getFieldConfig(selectedField.fieldName)}
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={(updates) => {
            updateFieldConfig(selectedField.fieldName, updates);
            setConfigDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

// Field Configuration Dialog Component
interface FieldConfigDialogProps {
  field: FieldDefinition;
  config?: TemplateFieldConfiguration;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<TemplateFieldConfiguration>) => void;
}

const FieldConfigDialog: React.FC<FieldConfigDialogProps> = ({
  field,
  config,
  open,
  onOpenChange,
  onSave
}) => {
  const [localConfig, setLocalConfig] = useState<Partial<TemplateFieldConfiguration>>({
    required: config?.required ?? field.required ?? false,
    visible: config?.visible ?? true,
    editable: config?.editable ?? true,
    defaultValue: config?.defaultValue ?? field.defaultValue,
    displayOrder: config?.displayOrder ?? 1,
    defaultVariesByClass: config?.defaultVariesByClass ?? false,
    valueConstraints: config?.valueConstraints
  });

  // Reset local config when field changes
  React.useEffect(() => {
    if (field && open) {
      setLocalConfig({
        required: config?.required ?? field.required ?? false,
        visible: config?.visible ?? true,
        editable: config?.editable ?? true,
        defaultValue: config?.defaultValue ?? field.defaultValue,
        displayOrder: config?.displayOrder ?? 1,
        defaultVariesByClass: config?.defaultVariesByClass ?? false,
        valueConstraints: config?.valueConstraints
      });
    }
  }, [field, config, open]);

  const handleSave = () => {
    onSave(localConfig);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {field.displayName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="required">Required Field</Label>
              <Switch
                id="required"
                checked={localConfig.required}
                onCheckedChange={(checked) => 
                  setLocalConfig({ ...localConfig, required: checked })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Users must fill this field when creating a class
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="visible">Visible</Label>
              <Switch
                id="visible"
                checked={localConfig.visible}
                onCheckedChange={(checked) => 
                  setLocalConfig({ ...localConfig, visible: checked })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Show this field in the form
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="editable">Editable</Label>
              <Switch
                id="editable"
                checked={localConfig.editable}
                onCheckedChange={(checked) => 
                  setLocalConfig({ ...localConfig, editable: checked })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Allow users to modify this field
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="defaultValue">Default Value</Label>
            {field.dataType === FieldDataType.SELECT && field.options ? (
              <Select
                value={String(localConfig.defaultValue || '__none__')}
                onValueChange={(value) => 
                  setLocalConfig({ ...localConfig, defaultValue: value === '__none__' ? undefined : value })
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
            ) : field.dataType === FieldDataType.BOOLEAN ? (
              <Select
                value={String(localConfig.defaultValue || 'false')}
                onValueChange={(value) => 
                  setLocalConfig({ ...localConfig, defaultValue: value === 'true' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            ) : field.dataType === FieldDataType.DURATION ? (
              <Input
                id="defaultValue"
                type="text"
                value={typeof localConfig.defaultValue === 'number' 
                  ? msToDisplay(localConfig.defaultValue, 'seconds') 
                  : String(localConfig.defaultValue || '')}
                onChange={(e) => {
                  const parsed = parseTimeInput(e.target.value);
                  if (parsed.isValid && parsed.ms !== undefined) {
                    setLocalConfig({ ...localConfig, defaultValue: parsed.ms });
                  } else {
                    setLocalConfig({ ...localConfig, defaultValue: e.target.value });
                  }
                }}
                placeholder="MM:SS (e.g., 1:30)"
              />
            ) : field.dataType === FieldDataType.DURATION_ARRAY ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Default time limits for multiple search areas. Actual count will be set by "Number of Search Areas" field.
                </p>
                <Input
                  id="defaultValue"
                  type="text"
                  value={Array.isArray(localConfig.defaultValue) 
                    ? localConfig.defaultValue.map(ms => msToDisplay(ms as number, 'seconds')).join(', ')
                    : String(localConfig.defaultValue || '3:00')}
                  onChange={(e) => {
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
            ) : field.dataType === FieldDataType.NUMBER || field.dataType === FieldDataType.CURRENCY ? (
              <Input
                id="defaultValue"
                type="number"
                value={String(localConfig.defaultValue || '')}
                onChange={(e) => 
                  setLocalConfig({ ...localConfig, defaultValue: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder={`Default: ${field.defaultValue || '0'}`}
                step={field.dataType === FieldDataType.CURRENCY ? '0.01' : '1'}
                min={field.minValue}
                max={field.maxValue}
              />
            ) : (
              <Input
                id="defaultValue"
                value={String(localConfig.defaultValue || '')}
                onChange={(e) => 
                  setLocalConfig({ ...localConfig, defaultValue: e.target.value })
                }
                placeholder={`Default: ${field.defaultValue || 'None'}`}
              />
            )}
            {field.unit && field.dataType !== FieldDataType.DURATION_ARRAY && (
              <p className="text-xs text-muted-foreground">Unit: {field.unit}</p>
            )}
            {field.dataType === FieldDataType.DURATION_ARRAY && (
              <p className="text-xs text-muted-foreground">
                Time format: MM:SS (e.g., 1:30 for 1 minute 30 seconds)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="defaultVariesByClass">Default varies by class</Label>
              <Switch
                id="defaultVariesByClass"
                checked={localConfig.defaultVariesByClass}
                onCheckedChange={(checked) => 
                  setLocalConfig({ ...localConfig, defaultVariesByClass: checked })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Allow different default values for each class in the template
            </p>
          </div>

          {/* Value Constraints Section */}
          {(field.dataType === FieldDataType.NUMBER || field.dataType === FieldDataType.CURRENCY || field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) && (
            <div className="space-y-2">
              <Label>Value Constraints (Optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="minValue" className="text-xs">
                    Minimum {(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) ? '(MM:SS)' : ''}
                  </Label>
                  <Input
                    id="minValue"
                    type={(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) ? "text" : "number"}
                    placeholder={(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) ? "0:30" : "No limit"}
                    value={(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) && localConfig.valueConstraints?.min
                      ? msToDisplay(localConfig.valueConstraints.min, 'seconds')
                      : (localConfig.valueConstraints?.min || '')}
                    onChange={(e) => {
                      let minValue: number | undefined;
                      if (field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) {
                        if (e.target.value) {
                          const parsed = parseTimeInput(e.target.value);
                          minValue = parsed.ms;
                        }
                      } else {
                        minValue = e.target.value ? Number(e.target.value) : undefined;
                      }
                      
                      setLocalConfig({ 
                        ...localConfig, 
                        valueConstraints: {
                          ...localConfig.valueConstraints,
                          type: 'range',
                          min: minValue
                        }
                      });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="maxValue" className="text-xs">
                    Maximum {(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) ? '(MM:SS)' : ''}
                  </Label>
                  <Input
                    id="maxValue"
                    type={(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) ? "text" : "number"}
                    placeholder={(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) ? "3:00" : "No limit"}
                    value={(field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) && localConfig.valueConstraints?.max
                      ? msToDisplay(localConfig.valueConstraints.max, 'seconds')
                      : (localConfig.valueConstraints?.max || '')}
                    onChange={(e) => {
                      let maxValue: number | undefined;
                      if (field.dataType === FieldDataType.DURATION || field.dataType === FieldDataType.DURATION_ARRAY) {
                        if (e.target.value) {
                          const parsed = parseTimeInput(e.target.value);
                          maxValue = parsed.ms;
                        }
                      } else {
                        maxValue = e.target.value ? Number(e.target.value) : undefined;
                      }
                      
                      setLocalConfig({ 
                        ...localConfig, 
                        valueConstraints: {
                          ...localConfig.valueConstraints,
                          type: 'range',
                          max: maxValue
                        }
                      });
                    }}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="constraintHint" className="text-xs">Helper Text</Label>
                <Input
                  id="constraintHint"
                  placeholder="e.g., 'Judge sets within 1-3 minutes'"
                  value={localConfig.valueConstraints?.hint || ''}
                  onChange={(e) => 
                    setLocalConfig({ 
                      ...localConfig, 
                      valueConstraints: {
                        ...localConfig.valueConstraints,
                        type: 'range',
                        hint: e.target.value
                      }
                    })
                  }
                />
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="displayOrder">Display Order</Label>
            <Input
              id="displayOrder"
              type="number"
              value={localConfig.displayOrder || 1}
              onChange={(e) => 
                setLocalConfig({ ...localConfig, displayOrder: parseInt(e.target.value) })
              }
              min={1}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};