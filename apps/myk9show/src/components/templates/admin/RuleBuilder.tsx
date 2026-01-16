import React, { useState } from 'react';
import { ClassTemplate, ValidationRule } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Shield, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';

interface RuleBuilderProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export const RuleBuilder: React.FC<RuleBuilderProps> = ({
  template,
  onChange,
  readOnly = false
}) => {
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  const rules = template.validationRules || [];
  const fields = template.fieldSpecifications || [];

  const handleAddRule = () => {
    if (readOnly) return;
    setEditingRule({
      ruleType: 'prohibited',
      fields: [],
      message: ''
    });
    setRuleDialogOpen(true);
  };

  const handleEditRule = (rule: ValidationRule, index: number) => {
    if (readOnly) return;
    setEditingRule({ ...rule, index } as ValidationRule & { index: number });
    setRuleDialogOpen(true);
  };

  const handleDeleteRule = (index: number) => {
    if (readOnly) return;
    const updatedRules = rules.filter((_, i) => i !== index);
    onChange({ validationRules: updatedRules });
  };

  const handleSaveRule = (rule: ValidationRule) => {
    const { index, ...ruleData } = rule as ValidationRule & { index?: number };
    let updatedRules: ValidationRule[];

    if (index !== undefined && index >= 0) {
      // Update existing rule
      updatedRules = [...rules];
      updatedRules[index] = ruleData;
    } else {
      // Add new rule
      updatedRules = [...rules, ruleData];
    }

    onChange({ validationRules: updatedRules });
    setRuleDialogOpen(false);
    setEditingRule(null);
  };

  const getRuleIcon = (ruleType: string) => {
    switch (ruleType) {
      case 'prohibited': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'required': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'conditional': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getRuleDescription = (rule: ValidationRule) => {
    switch (rule.ruleType) {
      case 'prohibited':
        return `Prevents invalid combinations of ${rule.fields.join(', ')}`;
      case 'required':
        return `Ensures ${rule.fields.join(', ')} are provided when needed`;
      case 'conditional':
        return `Applies conditional logic to ${rule.fields.join(', ')}`;
      default:
        return `Custom validation for ${rule.fields.join(', ')}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Validation Rules</h3>
          <p className="text-muted-foreground">
            Define rules to prevent invalid field combinations and ensure data integrity
          </p>
        </div>
        {!readOnly && (
          <Button onClick={handleAddRule}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Rule Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{rules.length}</div>
              <div className="text-sm text-muted-foreground">Total Rules</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {rules.filter(r => r.ruleType === 'prohibited').length}
              </div>
              <div className="text-sm text-muted-foreground">Prohibited</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {rules.filter(r => r.ruleType === 'required').length}
              </div>
              <div className="text-sm text-muted-foreground">Required</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {rules.filter(r => r.ruleType === 'conditional').length}
              </div>
              <div className="text-sm text-muted-foreground">Conditional</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Common Rule Templates */}
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Add Common Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rule: ValidationRule = {
                    ruleType: 'prohibited',
                    fields: ['element', 'level'],
                    condition: 'element === "Detective" && level !== undefined',
                    message: 'Detective class cannot have levels'
                  };
                  handleSaveRule(rule);
                }}
              >
                Detective No Levels
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rule: ValidationRule = {
                    ruleType: 'required',
                    fields: ['level', 'section'],
                    condition: 'level === "Novice" && !section',
                    message: 'Novice level requires section A or B'
                  };
                  handleSaveRule(rule);
                }}
              >
                Novice Requires Section
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rule: ValidationRule = {
                    ruleType: 'prohibited',
                    fields: ['level', 'section'],
                    condition: 'level !== "Novice" && section !== undefined',
                    message: 'Only Novice level has A/B sections'
                  };
                  handleSaveRule(rule);
                }}
              >
                Only Novice Has Sections
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      {rules.length > 0 ? (
        <div className="space-y-4">
          {rules.map((rule, index) => (
            <Card key={index}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getRuleIcon(rule.ruleType)}
                      <Badge variant={
                        rule.ruleType === 'prohibited' ? 'destructive' :
                        rule.ruleType === 'required' ? 'default' :
                        rule.ruleType === 'conditional' ? 'secondary' : 'outline'
                      }>
                        {rule.ruleType}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Fields: {rule.fields.join(', ')}
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-2">
                      {getRuleDescription(rule)}
                    </p>
                    
                    <p className="font-medium mb-2">{rule.message}</p>
                    
                    {rule.condition && (
                      <div className="bg-muted p-2 rounded text-sm font-mono">
                        {rule.condition}
                      </div>
                    )}
                  </div>
                  
                  {!readOnly && (
                    <div className="flex gap-1 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRule(rule, index)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRule(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No validation rules</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add validation rules to prevent invalid field combinations and ensure data integrity.
            </p>
            {!readOnly && (
              <Button onClick={handleAddRule}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Rule
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rule Editor Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Rule' : 'Add Rule'}
            </DialogTitle>
          </DialogHeader>
          
          {editingRule && (
            <RuleEditor
              rule={editingRule}
              fields={fields}
              onSave={handleSaveRule}
              onCancel={() => {
                setRuleDialogOpen(false);
                setEditingRule(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Rule Editor Component
interface RuleEditorProps {
  rule: ValidationRule;
  fields: { fieldName: string; displayName: string }[];
  onSave: (rule: ValidationRule) => void;
  onCancel: () => void;
}

const RuleEditor: React.FC<RuleEditorProps> = ({ rule, fields, onSave, onCancel }) => {
  const [editedRule, setEditedRule] = useState<ValidationRule>({ ...rule });

  const handleSave = () => {
    onSave(editedRule);
  };

  const handleChange = (key: keyof ValidationRule, value: unknown) => {
    setEditedRule(prev => ({ ...prev, [key]: value }));
  };

  const handleFieldsChange = (value: string) => {
    const selectedFields = value.split(',').map(f => f.trim()).filter(Boolean);
    setEditedRule(prev => ({ ...prev, fields: selectedFields }));
  };

  const ruleTypes = [
    { value: 'prohibited', label: 'Prohibited', description: 'Prevent invalid combinations' },
    { value: 'required', label: 'Required', description: 'Ensure fields are provided' },
    { value: 'conditional', label: 'Conditional', description: 'Apply conditional logic' },
    { value: 'custom', label: 'Custom', description: 'Custom validation expression' }
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rule Type</Label>
        <Select value={editedRule.ruleType} onValueChange={(value) => handleChange('ruleType', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ruleTypes.map(type => (
              <SelectItem key={type.value} value={type.value}>
                <div>
                  <div>{type.label}</div>
                  <div className="text-xs text-muted-foreground">{type.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Fields (comma-separated)</Label>
        <Input
          value={editedRule.fields.join(', ')}
          onChange={(e) => handleFieldsChange(e.target.value)}
          placeholder="element, level, section"
        />
        <div className="text-xs text-muted-foreground">
          Available fields: {fields.map(f => f.fieldName).join(', ')}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Error Message</Label>
        <Input
          value={editedRule.message || ''}
          onChange={(e) => handleChange('message', e.target.value)}
          placeholder="Error message to show when rule is violated"
        />
      </div>

      <div className="space-y-2">
        <Label>Condition (JavaScript expression)</Label>
        <Textarea
          value={editedRule.condition || ''}
          onChange={(e) => handleChange('condition', e.target.value)}
          placeholder="element === 'Detective' && level !== undefined"
          rows={3}
        />
        <div className="text-xs text-muted-foreground">
          Use field names as variables. Return true when the rule should trigger an error.
        </div>
      </div>

      {/* Common Condition Templates */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <div className="text-sm font-medium">Common Patterns</div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2 text-xs">
            <div><code>fieldName === "value"</code> - Field equals specific value</div>
            <div><code>fieldName !== undefined</code> - Field has any value</div>
            <div><code>fieldName1 === "value" && fieldName2 !== undefined</code> - Multiple conditions</div>
            <div><code>["value1", "value2"].includes(fieldName)</code> - Field in list</div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Rule
        </Button>
      </div>
    </div>
  );
};