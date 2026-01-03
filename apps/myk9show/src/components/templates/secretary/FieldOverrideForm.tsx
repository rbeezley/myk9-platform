import React, { useState } from 'react';
import { ClassTemplate, ClassDefinition, FieldSpecification } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Edit,
  DollarSign,
  Clock,
  Users,
  Settings,
  AlertTriangle,
  Info,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';

interface FieldOverrideFormProps {
  template: ClassTemplate;
  selectedClasses: ClassDefinition[];
  fieldOverrides: Record<string, unknown>;
  onOverrideChange: (fieldName: string, value: unknown) => void;
  onResetField: (fieldName: string) => void;
  onResetAll: () => void;
  showAdvanced?: boolean;
}

export const FieldOverrideForm: React.FC<FieldOverrideFormProps> = ({
  template,
  selectedClasses,
  fieldOverrides,
  onOverrideChange,
  onResetField,
  onResetAll,
  showAdvanced = false
}) => {
  const [showAllFields, setShowAllFields] = useState(showAdvanced);

  const fields = template.fieldSpecifications || [];
  
  // Group fields by category
  const fieldGroups: Record<string, FieldSpecification[]> = {
    basic: fields.filter(f => 
      ['organization', 'showType', 'element', 'level', 'section', 'className'].includes(f.fieldName)
    ),
    financial: fields.filter(f => 
      f.fieldName.toLowerCase().includes('fee') || 
      f.fieldName.toLowerCase().includes('cost') ||
      f.fieldName.toLowerCase().includes('entry') ||
      f.fieldName === 'maxEntries'
    ),
    timing: fields.filter(f => 
      f.fieldName.toLowerCase().includes('time') ||
      f.fieldName.toLowerCase().includes('duration') ||
      f.fieldName === 'estimatedJudgingTime'
    ),
    personnel: fields.filter(f => 
      f.fieldName.toLowerCase().includes('judge') ||
      f.fieldName.toLowerCase().includes('steward') ||
      f.fieldName.toLowerCase().includes('personnel')
    ),
    rules: fields.filter(f => 
      f.fieldName.toLowerCase().includes('hide') ||
      f.fieldName.toLowerCase().includes('search') ||
      f.fieldName.toLowerCase().includes('distraction') ||
      f.fieldName.toLowerCase().includes('area')
    ),
    other: fields.filter((f: FieldSpecification) => 
      !['basic', 'financial', 'timing', 'personnel', 'rules'].some((group: string) => 
        fieldGroups[group]?.includes(f)
      )
    )
  };

  // Filter editable fields
  const getEditableFields = (groupFields: FieldSpecification[]) => {
    return groupFields.filter(field => 
      field.editable && 
      (showAllFields || field.fieldSource !== 'rule-based') &&
      field.fieldName !== 'id'
    );
  };

  // Get default value for a field
  const getDefaultValue = (field: FieldSpecification) => {
    return field.defaultValue || '';
  };

  // Get current value for a field (override or default)
  const getCurrentValue = (field: FieldSpecification): string | number | boolean => {
    const value = fieldOverrides[field.fieldName] !== undefined 
      ? fieldOverrides[field.fieldName]
      : getDefaultValue(field);
    
    // Ensure we return a properly typed value
    if (field.dataType === 'number') {
      return typeof value === 'number' ? value : Number(value) || 0;
    }
    if (field.dataType === 'boolean') {
      return Boolean(value);
    }
    return String(value ?? '');
  };

  // Check if field has been overridden
  const isFieldOverridden = (field: FieldSpecification) => {
    return fieldOverrides[field.fieldName] !== undefined;
  };

  // Check if field should be shown based on conditional rules
  const shouldShowField = (field: FieldSpecification) => {
    if (!field.showWhen) return true;
    
    const conditions = Array.isArray(field.showWhen) ? field.showWhen : [field.showWhen];
    
    return conditions.some(condition => {
      const dependentValue = getCurrentValue(fields.find(f => f.fieldName === condition.dependsOn)!);
      
      switch (condition.condition) {
        case 'equals':
          return dependentValue === condition.value;
        case 'notEquals':
          return dependentValue !== condition.value;
        case 'in':
          return Array.isArray(condition.value) && condition.value.includes(String(dependentValue));
        case 'notIn':
          return Array.isArray(condition.value) && !condition.value.includes(String(dependentValue));
        default:
          return true;
      }
    });
  };

  // Render field input based on type
  const renderFieldInput = (field: FieldSpecification) => {
    const currentValue = getCurrentValue(field);
    const isOverridden = isFieldOverridden(field);

    const baseInputProps = {
      value: String(currentValue ?? ''),
      onChange: (value: unknown) => onOverrideChange(field.fieldName, value),
      disabled: !field.editable || field.fieldSource === 'rule-based'
    };
    
    const stringValue = String(currentValue ?? '');

    let input;

    switch (field.dataType) {
      case 'select':
        input = (
          <Select 
            value={stringValue} 
            onValueChange={(value) => onOverrideChange(field.fieldName, value)}
            disabled={baseInputProps.disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option, index) => {
                const key = typeof option === 'string' ? option : option.value;
                const label = typeof option === 'string' ? option : option.label;
                const value = typeof option === 'string' ? option : option.value;
                return (
                  <SelectItem key={key || index} value={value}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        );
        break;
        
      case 'boolean':
        input = (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={currentValue === true}
              onCheckedChange={(checked) => onOverrideChange(field.fieldName, checked)}
              disabled={baseInputProps.disabled}
            />
            <Label className="text-sm">
              {field.description || `Enable ${field.displayName}`}
            </Label>
          </div>
        );
        break;
        
      case 'text':
        input = (
          <Textarea
            value={stringValue}
            onChange={(e) => onOverrideChange(field.fieldName, e.target.value)}
            placeholder={field.description || `Enter ${field.displayName.toLowerCase()}`}
            disabled={baseInputProps.disabled}
            rows={3}
          />
        );
        break;
        
      case 'number':
        input = (
          <Input
            type="number"
            value={stringValue}
            onChange={(e) => onOverrideChange(field.fieldName, parseFloat(e.target.value) || 0)}
            placeholder={field.description || `Enter ${field.displayName.toLowerCase()}`}
            disabled={baseInputProps.disabled}
            min={field.allowedRange?.min}
            max={field.allowedRange?.max}
          />
        );
        break;
        
      default:
        input = (
          <Input
            type="text"
            value={stringValue}
            onChange={(e) => onOverrideChange(field.fieldName, e.target.value)}
            placeholder={field.description || `Enter ${field.displayName.toLowerCase()}`}
            disabled={baseInputProps.disabled}
          />
        );
    }

    return (
      <div key={field.fieldName} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            {field.displayName}
            {field.required && <span className="text-destructive">*</span>}
            <Badge variant={field.fieldSource === 'rule-based' ? 'default' : 'secondary'} className="text-xs">
              {field.fieldSource}
            </Badge>
            {isOverridden && (
              <Badge variant="outline" className="text-xs text-primary">
                Modified
              </Badge>
            )}
          </Label>
          {isOverridden && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResetField(field.fieldName)}
              className="h-6 px-2 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
        
        {input}
        
        {field.description && (
          <div className="text-xs text-muted-foreground">
            {field.description}
          </div>
        )}
        
        {field.fieldSource === 'rule-based' && (
          <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            This field is set by template rules and cannot be modified
          </div>
        )}
      </div>
    );
  };

  const getTabIcon = (tabName: string) => {
    switch (tabName) {
      case 'financial': return <DollarSign className="h-4 w-4" />;
      case 'timing': return <Clock className="h-4 w-4" />;
      case 'personnel': return <Users className="h-4 w-4" />;
      case 'rules': return <Settings className="h-4 w-4" />;
      default: return <Edit className="h-4 w-4" />;
    }
  };

  const overrideCount = Object.keys(fieldOverrides).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Field Overrides for {selectedClasses.length} Classes
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {overrideCount} field{overrideCount !== 1 ? 's' : ''} modified
              </Badge>
              {overrideCount > 0 && (
                <Button variant="outline" size="sm" onClick={onResetAll}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset All
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              Override default template values for the selected classes. Changes will apply to all {selectedClasses.length} selected classes.
            </p>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Show all fields:</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllFields(!showAllFields)}
                className="h-8 px-2"
              >
                {showAllFields ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Override Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={"basic"} onValueChange={() => {}}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic" className="flex items-center gap-1">
                {getTabIcon('basic')}
                <span className="hidden sm:inline">Basic</span>
              </TabsTrigger>
              <TabsTrigger value="financial" className="flex items-center gap-1">
                {getTabIcon('financial')}
                <span className="hidden sm:inline">Financial</span>
              </TabsTrigger>
              <TabsTrigger value="timing" className="flex items-center gap-1">
                {getTabIcon('timing')}
                <span className="hidden sm:inline">Timing</span>
              </TabsTrigger>
              <TabsTrigger value="personnel" className="flex items-center gap-1">
                {getTabIcon('personnel')}
                <span className="hidden sm:inline">Personnel</span>
              </TabsTrigger>
              <TabsTrigger value="rules" className="flex items-center gap-1">
                {getTabIcon('rules')}
                <span className="hidden sm:inline">Rules</span>
              </TabsTrigger>
            </TabsList>

            {/* Basic Fields */}
            <TabsContent value="basic" className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getEditableFields(fieldGroups.basic)
                  .filter(shouldShowField)
                  .map(renderFieldInput)}
              </div>
            </TabsContent>

            {/* Financial Fields */}
            <TabsContent value="financial" className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getEditableFields(fieldGroups.financial)
                  .filter(shouldShowField)
                  .map(renderFieldInput)}
              </div>
              {getEditableFields(fieldGroups.financial).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  No editable financial fields in this template
                </div>
              )}
            </TabsContent>

            {/* Timing Fields */}
            <TabsContent value="timing" className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getEditableFields(fieldGroups.timing)
                  .filter(shouldShowField)
                  .map(renderFieldInput)}
              </div>
              {getEditableFields(fieldGroups.timing).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  No editable timing fields in this template
                </div>
              )}
            </TabsContent>

            {/* Personnel Fields */}
            <TabsContent value="personnel" className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getEditableFields(fieldGroups.personnel)
                  .filter(shouldShowField)
                  .map(renderFieldInput)}
              </div>
              {getEditableFields(fieldGroups.personnel).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  No editable personnel fields in this template
                </div>
              )}
            </TabsContent>

            {/* Rules Fields */}
            <TabsContent value="rules" className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getEditableFields(fieldGroups.rules)
                  .filter(shouldShowField)
                  .map(renderFieldInput)}
              </div>
              {getEditableFields(fieldGroups.rules).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  No editable rule fields in this template
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Override Summary */}
      {overrideCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Override Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(fieldOverrides).map(([fieldName, value]) => {
                const field = fields.find(f => f.fieldName === fieldName);
                return field ? (
                  <div key={fieldName} className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="font-medium text-sm">{field.displayName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {String(value)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onResetField(fieldName)}
                        className="h-6 px-2"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Panel */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-2 text-sm">
              <h4 className="font-medium text-foreground">Field Override Guidelines</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <strong>Rule-based fields</strong> are automatically calculated and cannot be changed</li>
                <li>• <strong>Judge-set fields</strong> can be overridden but will need judge approval</li>
                <li>• <strong>Admin-set fields</strong> can be freely modified by show secretaries</li>
                <li>• Changes apply to all {selectedClasses.length} selected classes</li>
                <li>• You can reset individual fields or all overrides at any time</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};