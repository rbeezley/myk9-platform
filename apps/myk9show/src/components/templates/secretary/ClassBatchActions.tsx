import React, { useState } from 'react';
import { ClassDefinition, FieldSpecification } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/services/LoggingService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Settings,
  DollarSign,
  Clock,
  Users,
  Edit,
  Copy,
  Trash2,
  FileDown,
  CheckSquare,
  AlertTriangle
} from 'lucide-react';

interface ClassBatchActionsProps {
  selectedClasses: ClassDefinition[];
  availableFields: FieldSpecification[];
  onBatchEdit: (fieldName: string, value: string | number | boolean) => void;
  onBatchCopy: () => void;
  onBatchDelete: () => void;
  onExportSelection: () => void;
}

export const ClassBatchActions: React.FC<ClassBatchActionsProps> = ({
  selectedClasses,
  availableFields,
  onBatchEdit,
  onBatchCopy,
  onBatchDelete,
  onExportSelection
}) => {
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<string>('');
  const [fieldValue, setFieldValue] = useState<string | number | boolean>('');

  // Get editable fields for batch operations
  const editableFields = availableFields.filter(field => 
    field.editable && 
    field.fieldSource !== 'rule-based' &&
    ['string', 'number', 'boolean', 'select'].includes(field.dataType)
  );

  // Get field specification for selected field
  const fieldSpec = availableFields.find(f => f.fieldName === selectedField);

  const handleBatchEdit = () => {
    if (!selectedField || fieldValue === '') return;
    
    onBatchEdit(selectedField, fieldValue);
    setBatchEditOpen(false);
    setSelectedField('');
    setFieldValue('');
  };

  const resetBatchEdit = () => {
    setSelectedField('');
    setFieldValue('');
  };

  // Get common field values across selected classes
  const getCommonFieldValue = (fieldName: string) => {
    if (selectedClasses.length === 0) return null;
    
    const values = selectedClasses.map(cls => cls.fieldOverrides?.[fieldName]);
    const uniqueValues = Array.from(new Set(values));
    
    return uniqueValues.length === 1 ? uniqueValues[0] : 'Mixed Values';
  };

  // Group selected classes by type for summary
  const classSummary = selectedClasses.reduce((acc, cls) => {
    const key = `${cls.element}${cls.level ? ` ${cls.level}` : ''}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (selectedClasses.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Selection Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4" />
            Bulk Actions ({selectedClasses.length} classes selected)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Summary of Selected Classes */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(classSummary).map(([type, count]) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {type}: {count}
                </Badge>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchEditOpen(true)}
                disabled={editableFields.length === 0}
              >
                <Edit className="h-4 w-4 mr-1" />
                Batch Edit
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchCopy}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy Settings
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={onExportSelection}
              >
                <FileDown className="h-4 w-4 mr-1" />
                Export
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchDelete}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2 border-t">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span>Est. Time: {selectedClasses.length * 15} min</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span>Revenue: ${selectedClasses.length * 25}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-500" />
                <span>Max Entries: {selectedClasses.length * 20}</span>
              </div>
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-orange-500" />
                <span>Personnel: 4 required</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Common Field Values Preview */}
      {editableFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Field Values</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {editableFields.slice(0, 9).map(field => {
                const commonValue = getCommonFieldValue(field.fieldName);
                return (
                  <div key={field.fieldName} className="space-y-1">
                    <Label className="text-xs font-medium">{field.displayName}</Label>
                    <div className="text-sm">
                      {commonValue === 'Mixed Values' ? (
                        <span className="text-orange-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Mixed Values
                        </span>
                      ) : commonValue !== null && commonValue !== undefined ? (
                        <span className="text-green-600">{String(commonValue)}</span>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Edit Dialog */}
      <Dialog open={batchEditOpen} onOpenChange={setBatchEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Edit Classes</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Apply the same value to all {selectedClasses.length} selected classes.
            </div>

            {/* Field Selection */}
            <div className="space-y-2">
              <Label>Field to Edit</Label>
              <Select value={selectedField} onValueChange={(value) => {
                setSelectedField(value);
                setFieldValue('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a field..." />
                </SelectTrigger>
                <SelectContent>
                  {editableFields.map(field => (
                    <SelectItem key={field.fieldName} value={field.fieldName}>
                      <div>
                        <div>{field.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {field.dataType} • {field.fieldSource}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value Input */}
            {fieldSpec && (
              <div className="space-y-2">
                <Label>New Value</Label>
                {fieldSpec.dataType === 'select' && fieldSpec.options ? (
                  <Select value={String(fieldValue)} onValueChange={setFieldValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a value..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldSpec.options.map((option, index) => {
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
                ) : fieldSpec.dataType === 'boolean' ? (
                  <Select value={String(fieldValue)} onValueChange={(value) => setFieldValue(value === 'true')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={fieldSpec.dataType === 'number' ? 'number' : 'text'}
                    value={String(fieldValue)}
                    onChange={(e) => setFieldValue(
                      fieldSpec.dataType === 'number' 
                        ? parseFloat(e.target.value) || 0
                        : e.target.value
                    )}
                    placeholder={fieldSpec.description || `Enter ${fieldSpec.displayName.toLowerCase()}`}
                  />
                )}
                {fieldSpec.description && (
                  <div className="text-xs text-muted-foreground">
                    {fieldSpec.description}
                  </div>
                )}
              </div>
            )}

            {/* Current Value Info */}
            {fieldSpec && (
              <div className="bg-muted p-3 rounded text-sm">
                <div className="font-medium mb-1">Current Values:</div>
                <div className="text-muted-foreground">
                  {String(getCommonFieldValue(fieldSpec.fieldName) || 'Not set')}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setBatchEditOpen(false);
                  resetBatchEdit();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBatchEdit}
                disabled={!selectedField || fieldValue === ''}
              >
                Apply to {selectedClasses.length} Classes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};