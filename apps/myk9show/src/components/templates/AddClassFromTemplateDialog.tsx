import React, { useState, useEffect } from 'react';
import { ClassTemplate } from '@/types/template.types';
import { ClassFieldValues } from '@/types/field-definition-types';
import { DynamicClassForm } from './DynamicClassForm';
import { usesStructuredFields } from '@/lib/fieldUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Plus, FileText } from 'lucide-react';

interface AddClassFromTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (classData: ClassFieldValues, template: ClassTemplate) => void;
  availableTemplates: ClassTemplate[];
  trialId?: string;
  showId?: string;
}

export const AddClassFromTemplateDialog: React.FC<AddClassFromTemplateDialogProps> = ({
  open,
  onClose,
  onSave,
  availableTemplates,
  trialId,
  showId
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<ClassTemplate | null>(null);
  const [step, setStep] = useState<'template' | 'class'>('template');
  
  // Filter templates to only show those with structured fields
  const structuredTemplates = availableTemplates.filter(template => 
    usesStructuredFields(template) && template.isActive
  );
  
  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedTemplateId('');
      setSelectedTemplate(null);
      setStep('template');
    }
  }, [open]);
  
  // Update selected template when ID changes
  useEffect(() => {
    if (selectedTemplateId) {
      const template = structuredTemplates.find(t => t.id === selectedTemplateId);
      setSelectedTemplate(template || null);
    } else {
      setSelectedTemplate(null);
    }
  }, [selectedTemplateId, structuredTemplates]);
  
  const handleTemplateSelect = () => {
    if (selectedTemplate) {
      setStep('class');
    }
  };
  
  const handleClassSave = (values: ClassFieldValues) => {
    if (selectedTemplate) {
      // Add trial/show context if provided
      const classData: ClassFieldValues = {
        ...values,
        ...(trialId && { trialId }),
        ...(showId && { showId })
      };
      
      onSave(classData, selectedTemplate);
      onClose();
    }
  };
  
  const handleBack = () => {
    setStep('template');
  };
  
  const renderTemplateSelection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Template</h3>
        <p className="text-sm text-muted-foreground">
          Choose a template to create a new class. Only templates with structured fields are shown.
        </p>
      </div>
      
      {structuredTemplates.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No templates with structured fields are available. Please create a template first or ensure your templates have field configurations set up.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="template-select">Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger id="template-select">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {structuredTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <span>{template.templateName}</span>
                      <Badge variant="outline" className="text-xs">
                        {template.organization}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {template.showType}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {selectedTemplate.templateName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Organization:</span>
                    <br />
                    {selectedTemplate.organization}
                  </div>
                  <div>
                    <span className="font-medium">Show Type:</span>
                    <br />
                    {selectedTemplate.showType}
                  </div>
                  <div>
                    <span className="font-medium">Version:</span>
                    <br />
                    {selectedTemplate.version}
                  </div>
                  <div>
                    <span className="font-medium">Fields:</span>
                    <br />
                    {selectedTemplate.fieldConfigurations?.length || 0} configured
                  </div>
                </div>
                
                {selectedTemplate.description && (
                  <div>
                    <span className="font-medium text-sm">Description:</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedTemplate.description}
                    </p>
                  </div>
                )}
                
                <div className="flex justify-end">
                  <Button onClick={handleTemplateSelect}>
                    <Plus className="h-4 w-4 mr-2" />
                    Use This Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
  
  const renderClassForm = () => {
    if (!selectedTemplate) return null;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Create Class</h3>
            <p className="text-sm text-muted-foreground">
              Using template: {selectedTemplate.templateName}
            </p>
          </div>
          <Button variant="outline" onClick={handleBack} size="sm">
            Back to Templates
          </Button>
        </div>
        
        <DynamicClassForm
          template={selectedTemplate}
          onSave={handleClassSave}
          onCancel={handleBack}
        />
      </div>
    );
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'template' ? 'Add Class from Template' : 'Create New Class'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {step === 'template' ? renderTemplateSelection() : renderClassForm()}
        </div>
      </DialogContent>
    </Dialog>
  );
};