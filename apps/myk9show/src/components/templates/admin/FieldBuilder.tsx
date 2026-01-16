import React, { useState } from 'react';
import { ClassTemplate, FieldSpecification, FieldDataType, FieldSource } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  Settings, 
  Eye, 
  EyeOff,
  AlertCircle
} from 'lucide-react';

interface FieldBuilderProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export const FieldBuilder: React.FC<FieldBuilderProps> = ({
  template,
  onChange,
  readOnly = false
}) => {
  const [editingField, setEditingField] = useState<FieldSpecification | null>(null);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);

  const fields = template.fieldSpecifications || [];

  const handleAddField = () => {
    if (readOnly) return;
    setEditingField({
      fieldName: '',
      displayName: '',
      fieldSource: 'admin-set',
      dataType: 'string',
      required: false,
      editable: true,
      displayOrder: fields.length + 1,
      groupName: 'General',
      columnWidth: 1
    });
    setFieldDialogOpen(true);
  };

  const handleEditField = (field: FieldSpecification) => {
    if (readOnly) return;
    setEditingField({ ...field });
    setFieldDialogOpen(true);
  };

  const handleDeleteField = (fieldName: string) => {
    if (readOnly) return;
    const updatedFields = fields.filter(f => f.fieldName !== fieldName);
    onChange({ fieldSpecifications: updatedFields });
  };

  const handleSaveField = (field: FieldSpecification) => {
    const existingIndex = fields.findIndex(f => f.fieldName === field.fieldName);
    let updatedFields: FieldSpecification[];

    if (existingIndex >= 0) {
      // Update existing field
      updatedFields = [...fields];
      updatedFields[existingIndex] = field;
    } else {
      // Add new field
      updatedFields = [...fields, field];
    }

    onChange({ fieldSpecifications: updatedFields });
    setFieldDialogOpen(false);
    setEditingField(null);
  };

  const handleMoveField = (fieldName: string, direction: 'up' | 'down') => {
    if (readOnly) return;
    const index = fields.findIndex(f => f.fieldName === fieldName);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const updatedFields = [...fields];
    [updatedFields[index], updatedFields[newIndex]] = [updatedFields[newIndex], updatedFields[index]];
    
    // Update display orders
    updatedFields.forEach((field, idx) => {
      field.displayOrder = idx + 1;
    });

    onChange({ fieldSpecifications: updatedFields });
  };

  const groupedFields = fields.reduce((groups, field) => {
    const group = field.groupName || 'General';
    if (!groups[group]) groups[group] = [];
    groups[group].push(field);
    return groups;
  }, {} as Record<string, FieldSpecification[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Field Specifications</h3>
          <p className="text-muted-foreground">
            Define the fields that will be available for classes created from this template
          </p>
        </div>
        {!readOnly && (
          <Button onClick={handleAddField}>
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        )}
      </div>

      {/* Field Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{fields.length}</div>
              <div className="text-sm text-muted-foreground">Total Fields</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {fields.filter(f => f.required).length}
              </div>
              <div className="text-sm text-muted-foreground">Required</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {Object.keys(groupedFields).length}
              </div>
              <div className="text-sm text-muted-foreground">Groups</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {fields.filter(f => f.showWhen).length}
              </div>
              <div className="text-sm text-muted-foreground">Conditional</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fields by Group */}
      {Object.entries(groupedFields).map(([groupName, groupFields]) => (
        <Card key={groupName}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {groupName}
              <Badge variant="secondary">{groupFields.length} fields</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {groupFields
                .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                .map((field, index) => (
                  <div key={field.fieldName} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                      <div>
                        <div className="font-medium">{field.displayName}</div>
                        <div className="text-sm text-muted-foreground">{field.fieldName}</div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{field.dataType}</Badge>
                        <Badge variant={field.fieldSource === 'rule-based' ? 'default' : 'secondary'}>
                          {field.fieldSource}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {field.required && <Badge variant="destructive">Required</Badge>}
                        {field.showWhen && (
                          <Badge variant="outline" className="text-orange-600">
                            <Eye className="w-3 h-3 mr-1" />
                            Conditional
                          </Badge>
                        )}
                        {!field.editable && (
                          <Badge variant="outline" className="text-gray-600">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Read-only
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex justify-end gap-1">
                        {!readOnly && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveField(field.fieldName, 'up')}
                              disabled={index === 0}
                            >
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveField(field.fieldName, 'down')}
                              disabled={index === groupFields.length - 1}
                            >
                              ↓
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditField(field)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteField(field.fieldName)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {fields.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No fields defined</h3>
            <p className="text-muted-foreground text-center mb-4">
              Start by adding field specifications that define what information can be collected for each class.
            </p>
            {!readOnly && (
              <Button onClick={handleAddField}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Field
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Field Editor Dialog */}
      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField?.fieldName ? 'Edit Field' : 'Add Field'}
            </DialogTitle>
          </DialogHeader>
          
          {editingField && (
            <FieldEditor
              field={editingField}
              onSave={handleSaveField}
              onCancel={() => {
                setFieldDialogOpen(false);
                setEditingField(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Field Editor Component
interface FieldEditorProps {
  field: FieldSpecification;
  onSave: (field: FieldSpecification) => void;
  onCancel: () => void;
}

const FieldEditor: React.FC<FieldEditorProps> = ({ field, onSave, onCancel }) => {
  const [editedField, setEditedField] = useState<FieldSpecification>({ ...field });

  const handleSave = () => {
    onSave(editedField);
  };

  const handleChange = (key: keyof FieldSpecification, value: string | boolean | number | string[]) => {
    setEditedField(prev => ({ ...prev, [key]: value }));
  };

  const _dataTypes: FieldDataType[] = ['string', 'number', 'boolean', 'date', 'time', 'datetime', 'select', 'multi-select', 'text', 'rich-text'];
  const fieldSources: FieldSource[] = ['rule-based', 'judge-set', 'admin-set', 'calculated', 'fixed'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Field Name *</Label>
          <Input
            value={editedField.fieldName || ''}
            onChange={(e) => handleChange('fieldName', e.target.value)}
            placeholder="camelCase identifier"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Display Name *</Label>
          <Input
            value={editedField.displayName || ''}
            onChange={(e) => handleChange('displayName', e.target.value)}
            placeholder="Human readable name"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={editedField.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Help text for users"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Data Type</Label>
          <Select value={editedField.dataType || 'string'} onValueChange={(value) => handleChange('dataType', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {_dataTypes.map((type: string) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Field Source</Label>
          <Select value={editedField.fieldSource || 'admin-set'} onValueChange={(value) => handleChange('fieldSource', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldSources.map(source => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Group Name</Label>
          <Input
            value={editedField.groupName || ''}
            onChange={(e) => handleChange('groupName', e.target.value)}
            placeholder="General"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="flex items-center space-x-2">
          <Switch
            checked={editedField.required}
            onCheckedChange={(checked: boolean) => handleChange('required', checked)}
          />
          <Label>Required</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={editedField.editable}
            onCheckedChange={(checked: boolean) => handleChange('editable', checked)}
          />
          <Label>Editable</Label>
        </div>

        <div className="space-y-2">
          <Label>Display Order</Label>
          <Input
            type="number"
            value={editedField.displayOrder || ''}
            onChange={(e) => handleChange('displayOrder', Number(e.target.value))}
            min="1"
          />
        </div>

        <div className="space-y-2">
          <Label>Column Width</Label>
          <Select 
            value={String(editedField.columnWidth || '1')} 
            onValueChange={(value) => handleChange('columnWidth', Number(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Column</SelectItem>
              <SelectItem value="2">2 Columns</SelectItem>
              <SelectItem value="3">3 Columns</SelectItem>
              <SelectItem value="4">4 Columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(editedField.dataType === 'select' || editedField.dataType === 'multi-select') && (
        <div className="space-y-2">
          <Label>Options (one per line)</Label>
          <Textarea
            value={editedField.options?.join('\n') || ''}
            onChange={(e) => handleChange('options', e.target.value.split('\n').filter(Boolean))}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={4}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Default Value</Label>
          <Input
            value={String(editedField.defaultValue || '')}
            onChange={(e) => handleChange('defaultValue', e.target.value)}
            placeholder="Default value"
          />
        </div>

        <div className="space-y-2">
          <Label>Rule Value</Label>
          <Input
            value={String(editedField.ruleValue || '')}
            onChange={(e) => handleChange('ruleValue', e.target.value)}
            placeholder="Value set by rules"
          />
        </div>
      </div>

      <Separator />

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Field
        </Button>
      </div>
    </div>
  );
};