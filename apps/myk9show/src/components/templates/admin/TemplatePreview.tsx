import React, { useState } from 'react';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Eye, 
  Settings, 
  Play, 
  AlertTriangle, 
  CheckCircle,
  Search,
  Users,
  DollarSign,
  Clock
} from 'lucide-react';

interface TemplatePreviewProps {
  template: ClassTemplate;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({ template }) => {
  const [selectedClass, setSelectedClass] = useState<ClassDefinition | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [testValues, setTestValues] = useState<Record<string, string | number | boolean>>({});

  const classes = template.classDefinitions || [];
  const fields = template.fieldSpecifications || [];
  const rules = template.validationRules || [];

  // Filter classes based on search
  const filteredClasses = classes.filter(cls =>
    cls.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.element.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.level?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTestValueChange = (fieldName: string, value: string | number | boolean) => {
    setTestValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const validateTestValues = () => {
    const errors: string[] = [];
    
    // Check required fields
    fields.forEach(field => {
      if (field.required && (!testValues[field.fieldName] || testValues[field.fieldName] === '')) {
        errors.push(`${field.displayName} is required`);
      }
    });

    // Check validation rules
    rules.forEach(rule => {
      if (rule.condition) {
        try {
          const fieldValues = rule.fields.reduce((acc, fieldName) => {
            acc[fieldName] = testValues[fieldName];
            return acc;
          }, {} as Record<string, string | number | boolean>);

          // Safe condition evaluation without eval
          const evaluateCondition = (condition: string): boolean => {
            // Handle simple conditions like "fieldName === 'value'" or "fieldName > number"
            const comparisonRegex = /(\w+)\s*(===|!==|==|!=|>=|<=|>|<)\s*(['"]?)([^'"]*)\3/;
            const match = condition.match(comparisonRegex);
            
            if (match) {
              const [, fieldName, operator, , value] = match;
              const fieldValue = fieldValues[fieldName];
              
              // Convert value to appropriate type
              let compareValue: string | number | boolean = value;
              if (!isNaN(Number(value))) {
                compareValue = Number(value);
              } else if (value === 'true' || value === 'false') {
                compareValue = value === 'true';
              }
              
              switch (operator) {
                case '===':
                case '==':
                  return fieldValue === compareValue;
                case '!==':
                case '!=':
                  return fieldValue !== compareValue;
                case '>':
                  return Number(fieldValue) > Number(compareValue);
                case '<':
                  return Number(fieldValue) < Number(compareValue);
                case '>=':
                  return Number(fieldValue) >= Number(compareValue);
                case '<=':
                  return Number(fieldValue) <= Number(compareValue);
                default:
                  return false;
              }
            }
            
            // Handle logical operators (AND/OR)
            if (condition.includes(' && ')) {
              const parts = condition.split(' && ');
              return parts.every(part => evaluateCondition(part.trim()));
            }
            
            if (condition.includes(' || ')) {
              const parts = condition.split(' || ');
              return parts.some(part => evaluateCondition(part.trim()));
            }
            
            // Default to false for unhandled conditions
            console.warn('Unhandled condition format:', condition);
            return false;
          };
          
          const conditionMet = evaluateCondition(rule.condition);
          
          if (conditionMet) {
            errors.push(rule.message);
          }
        } catch (e) {
          console.error('Error evaluating condition:', e);
        }
      }
    });

    return errors;
  };

  const validationErrors = validateTestValues();

  return (
    <div className="space-y-6">
      {/* Template Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Template Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-semibold mb-2">{template.templateName}</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>{template.organization} • {template.showType}</div>
                <div>Version {template.version}</div>
                {template.description && <div>{template.description}</div>}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{classes.length}</div>
                <div className="text-sm text-muted-foreground">Classes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{fields.length}</div>
                <div className="text-sm text-muted-foreground">Fields</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">
                  Entry: ${template.defaults?.entryFees?.preEntry} / ${template.defaults?.entryFees?.dayOfShow}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm">
                  Judging: {template.defaults?.judgingTimeEstimate} min
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="text-sm">
                  Min Age: {template.defaults?.minimumAge} months
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="classes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="classes">Classes ({classes.length})</TabsTrigger>
          <TabsTrigger value="fields">Fields ({fields.length})</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        {/* Classes Tab */}
        <TabsContent value="classes" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search classes..."
                value={""}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredClasses.length} of {classes.length} classes
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClasses.map((cls, index) => (
              <Card 
                key={index}
                className={`cursor-pointer transition-colors ${
                  selectedClass?.className === cls.className ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedClass(cls)}
              >
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">{cls.className}</h4>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">{cls.element}</Badge>
                      {cls.level && <Badge variant="secondary">{cls.level}</Badge>}
                      {cls.section && <Badge variant="outline">{cls.section}</Badge>}
                    </div>
                    
                    {cls.fieldOverrides && Object.keys(cls.fieldOverrides).length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {Object.keys(cls.fieldOverrides).length} field overrides
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedClass && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Class Details: {selectedClass.className}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Element</Label>
                      <div>{selectedClass.element}</div>
                    </div>
                    {selectedClass.level && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Level</Label>
                        <div>{selectedClass.level}</div>
                      </div>
                    )}
                    {selectedClass.section && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Section</Label>
                        <div>{selectedClass.section}</div>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">Display Order</Label>
                      <div>{selectedClass.displayOrder}</div>
                    </div>
                  </div>

                  {selectedClass.fieldOverrides && Object.keys(selectedClass.fieldOverrides).length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Field Overrides</Label>
                      <div className="mt-2 space-y-2">
                        {Object.entries(selectedClass.fieldOverrides).map(([fieldName, overrides]) => (
                          <div key={fieldName} className="flex justify-between items-center p-2 bg-muted rounded">
                            <span className="font-medium">{fieldName}</span>
                            <div className="text-sm text-muted-foreground">
                              {Object.entries(overrides).map(([key, value]) => (
                                <div key={key}>{key}: {JSON.stringify(value)}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Fields Tab */}
        <TabsContent value="fields" className="space-y-4">
          <div className="grid gap-4">
            {fields.map((field, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{field.displayName}</h4>
                        <Badge variant="outline">{field.dataType}</Badge>
                        <Badge variant={field.fieldSource === 'rule-based' ? 'default' : 'secondary'}>
                          {field.fieldSource}
                        </Badge>
                        {field.required && <Badge variant="destructive">Required</Badge>}
                      </div>
                      
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>Field Name: {field.fieldName}</div>
                        {field.description && <div>Description: {field.description}</div>}
                        {field.groupName && <div>Group: {field.groupName}</div>}
                        {field.defaultValue !== undefined && (
                          <div>Default: {JSON.stringify(field.defaultValue)}</div>
                        )}
                        {field.options && field.options.length > 0 && (
                          <div>Options: {field.options.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          {rules.length > 0 ? (
            <div className="space-y-4">
              {rules.map((rule, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {rule.ruleType === 'prohibited' && <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />}
                      {rule.ruleType === 'required' && <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />}
                      {rule.ruleType === 'conditional' && <Settings className="h-5 w-5 text-yellow-500 mt-0.5" />}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={
                            rule.ruleType === 'prohibited' ? 'destructive' :
                            rule.ruleType === 'required' ? 'default' : 'secondary'
                          }>
                            {rule.ruleType}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Fields: {rule.fields.join(', ')}
                          </span>
                        </div>
                        
                        <p className="font-medium mb-2">{rule.message}</p>
                        
                        {rule.condition && (
                          <div className="bg-muted p-2 rounded text-sm font-mono">
                            {rule.condition}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No validation rules</h3>
                <p className="text-muted-foreground text-center">
                  This template doesn't have any validation rules defined.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Test Tab */}
        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Test Template Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Enter test values to see how the validation rules work:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields.slice(0, 8).map((field) => (
                  <div key={field.fieldName} className="space-y-2">
                    <Label>
                      {field.displayName}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.dataType === 'select' && field.options ? (
                      <select
                        className="w-full px-3 py-2 border rounded"
                        value={""}
                        onChange={(e) => handleTestValueChange(field.fieldName, e.target.value)}
                      >
                        <option value="">Select...</option>
                        {field.options.map(option => {
                          const isObject = typeof option === 'object' && option !== null;
                          const key = isObject ? (option as {value: string}).value : option as string;
                          const label = isObject ? (option as {label: string}).label : option as string;
                          return (
                            <option key={key} value={""}>{label}</option>
                          );
                        })}
                      </select>
                    ) : field.dataType === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(testValues[field.fieldName]) || false}
                        onChange={(e) => handleTestValueChange(field.fieldName, e.target.checked)}
                      />
                    ) : (
                      <Input
                        type={field.dataType === 'number' ? 'number' : 'text'}
                        value={""}
                        onChange={(e) => handleTestValueChange(field.fieldName, e.target.value)}
                        placeholder={field.description || `Enter ${field.displayName.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-medium">Validation Results</h4>
                {validationErrors.length > 0 ? (
                  <div className="space-y-2">
                    {validationErrors.map((error, index) => (
                      <div key={index} className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>All validation rules pass</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};