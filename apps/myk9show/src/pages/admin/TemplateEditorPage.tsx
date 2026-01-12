import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTemplateStore } from '@/store/templateStore';
import { ClassTemplate, ClassDefinition, Organization, ShowType } from '@/types/template.types';
import { TemplateForm } from '@/components/templates/admin/TemplateForm';
import { TemplatePreview } from '@/components/templates/admin/TemplatePreview';
import { FieldBuilder } from '@/components/templates/admin/FieldBuilder';
import { FieldConfigurator } from '@/components/templates/admin/FieldConfigurator';
import { RuleBuilder } from '@/components/templates/admin/RuleBuilder';
import { ClassDefinitionTable } from '@/components/templates/admin/ClassDefinitionTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
import { logger } from '@/services/LoggingService';
  Save, 
  ArrowLeft, 
  Eye, 
  Settings, 
  FileText, 
  TestTube,
  AlertTriangle,
  Layers,
  Plus
} from 'lucide-react';

export const TemplateEditorPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { getTemplate, createTemplate, updateTemplate, createEditableCopy } = useTemplateStore();
  
  const isNew = location.pathname.endsWith('/new');
  
  const [template, setTemplate] = useState<Partial<ClassTemplate>>(
    isNew ? {
      templateName: 'New Template',
      organization: Organization.AKC,
      showType: ShowType.SCENT_WORK,
      version: '1.0.0',
      description: '',
      isActive: true,
      isOfficial: false,
      isCustom: true,
      fieldConfigurations: [],
      fieldSpecifications: [],
      classDefinitions: [],
      validationRules: [],
      defaults: {
        entryFees: {
          preEntry: 25,
          dayOfShow: 30
        }
      }
    } : {}
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('basic');
  const [editingClass, setEditingClass] = useState<{index: number, class: ClassDefinition} | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Check if template can be edited using new flexible system
  const editability = template.id ? useTemplateStore.getState().canEdit(template as ClassTemplate) : { canEdit: true };
  const canEdit = editability.canEdit;
  const editWarning = editability.reason || template.editWarning;

  // Load template on mount
  useEffect(() => {
    if (!isNew && templateId) {
      const existingTemplate = getTemplate(templateId);
      if (existingTemplate) {
        setTemplate(existingTemplate);
      } else {
        navigate('/admin/templates');
      }
    }
  }, [templateId, isNew, getTemplate, navigate]);

  const handleTemplateChange = (updates: Partial<ClassTemplate>) => {
    setTemplate(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const validateTemplate = (): boolean => {
    const errors: string[] = [];

    if (!template.templateName?.trim()) {
      errors.push('Template name is required');
    }

    if (!template.organization) {
      errors.push('Organization is required');
    }

    if (!template.showType) {
      errors.push('Show type is required');
    }

    // Check for either new field configurations or legacy field specifications
    const hasFields = (template.fieldConfigurations && template.fieldConfigurations.length > 0) ||
                     (template.fieldSpecifications && template.fieldSpecifications.length > 0);
    
    if (!hasFields) {
      errors.push('At least one field must be configured');
    }

    if (!template.classDefinitions || template.classDefinitions.length === 0) {
      errors.push('At least one class definition is required');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    if (!validateTemplate()) {
      setActiveTab('basic'); // Switch to basic tab to show errors
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = createTemplate(template as Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'>);
        navigate(`/admin/templates/${created.id}/edit`);
      } else if (templateId) {
        updateTemplate(templateId, template);
      }
      setHasChanges(false);
    } catch (error) {
      logger.error('Failed to save template:', 'pages', {}, error as Error);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = () => {
    if (templateId && templateId !== 'new') {
      navigate(`/admin/templates/${templateId}/test`);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) return;
    }
    navigate('/admin/templates');
  };

  const handleEditClass = (index: number) => {
    try {
      const classDef = template.classDefinitions?.[index];
      if (classDef) {
        logger.debug('Editing class:', 'admin', { data: classDef });
        setEditingClass({ index, class: { ...classDef } });
        setEditDialogOpen(true);
      } else {
        logger.error('Class definition not found at index:', 'pages', {}, index as Error);
      }
    } catch (error) {
      logger.error('Error in handleEditClass:', 'pages', {}, error as Error);
    }
  };

  const handleSaveClass = () => {
    if (!editingClass) return;
    
    const updatedClasses = [...(template.classDefinitions || [])];
    updatedClasses[editingClass.index] = editingClass.class;
    
    handleTemplateChange({ classDefinitions: updatedClasses });
    setEditDialogOpen(false);
    setEditingClass(null);
  };

  const handleClassFieldChange = (field: keyof ClassDefinition, value: string | number | boolean) => {
    if (!editingClass) return;
    
    const updatedClass = {
      ...editingClass.class,
      [field]: value
    };
    
    // Auto-generate class name when element, level, or section changes
    if (field === 'element' || field === 'level' || field === 'section') {
      const parts = [updatedClass.element];
      if (updatedClass.level) parts.push(updatedClass.level);
      if (updatedClass.section) parts.push(updatedClass.section);
      updatedClass.className = parts.join(' ').trim();
    }
    
    setEditingClass({
      ...editingClass,
      class: updatedClass
    });
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case 'basic': return <FileText className="h-4 w-4" />;
      case 'fields': return <Settings className="h-4 w-4" />;
      case 'classes': return <Layers className="h-4 w-4" />;
      case 'rules': return <AlertTriangle className="h-4 w-4" />;
      case 'preview': return <Eye className="h-4 w-4" />;
      default: return null;
    }
  };

  if (!isNew && !template.templateName) {
    return (
      <div className="container mx-auto p-6 pt-20">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading template...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-full pt-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-2xl font-bold">{isNew ? 'Create' : 'Edit'} Template</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">{template.templateName}</span>
              {template.isOfficial && (
                <Badge variant="default">Official</Badge>
              )}
              {template.isCustom && (
                <Badge variant="secondary">Custom</Badge>
              )}
              {hasChanges && (
                <Badge variant="outline" className="text-orange-600">
                  Unsaved Changes
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!isNew && (
            <Button variant="outline" onClick={handleTest}>
              <TestTube className="h-4 w-4 mr-2" />
              Test Template
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={saving || (!canEdit && !isNew)}
            className="min-w-[100px]"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isNew ? 'Create' : 'Save'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Template Warning/Info */}
      {editWarning && !isNew && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                    {template.type === 'official' ? 'Official Template' : 'Template Notice'}
                  </h3>
                  <p className="text-amber-700 dark:text-amber-300 text-sm">
                    {editWarning}
                  </p>
                </div>
              </div>
              
              {template.type === 'official' && templateId && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const copy = createEditableCopy(templateId, `${template.templateName} (My Copy)`);
                      if (copy) {
                        navigate(`/admin/templates/${copy.id}/edit`);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Make Editable Copy
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800 mb-2">Please fix the following errors:</h3>
                <ul className="list-disc list-inside space-y-1 text-red-700">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editor Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic" className="flex items-center gap-2">
            {getTabIcon('basic')}
            Basic Info
          </TabsTrigger>
          <TabsTrigger value="fields" className="flex items-center gap-2">
            {getTabIcon('fields')}
            Fields
          </TabsTrigger>
          <TabsTrigger value="classes" className="flex items-center gap-2">
            {getTabIcon('classes')}
            Classes
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            {getTabIcon('rules')}
            Rules
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-2">
            {getTabIcon('preview')}
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-6">
          <TemplateForm 
            template={template}
            onChange={handleTemplateChange}
            readOnly={!canEdit}
          />
        </TabsContent>

        <TabsContent value="fields" className="space-y-6">
          {/* Use new structured field configurator for supported show types */}
          {template.showType && Object.values(ShowType).includes(template.showType as ShowType) ? (
            <FieldConfigurator 
              template={template}
              onChange={handleTemplateChange}
              readOnly={!canEdit}
            />
          ) : (
            <FieldBuilder 
              template={template}
              onChange={handleTemplateChange}
              readOnly={!canEdit}
            />
          )}
        </TabsContent>

        <TabsContent value="classes" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Class Definitions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ClassDefinitionTable
                classes={template.classDefinitions || []}
                onChange={(classes) => handleTemplateChange({ classDefinitions: classes })}
                onEdit={handleEditClass}
                readOnly={!canEdit}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <RuleBuilder 
            template={template}
            onChange={handleTemplateChange}
            readOnly={!canEdit}
          />
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <TemplatePreview template={template as ClassTemplate} />
        </TabsContent>
      </Tabs>

      {/* Edit Class Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
          </DialogHeader>
          {editingClass && editingClass.class && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="element">Element</Label>
                <Select 
                  value={editingClass.class.element || ''} 
                  onValueChange={(value) => handleClassFieldChange('element', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select element" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Container">Container</SelectItem>
                    <SelectItem value="Buried">Buried</SelectItem>
                    <SelectItem value="Interior">Interior</SelectItem>
                    <SelectItem value="Exterior">Exterior</SelectItem>
                    <SelectItem value="Handler Discrimination">Handler Discrimination</SelectItem>
                    <SelectItem value="Novice A/B">Novice A/B</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                    <SelectItem value="Excellent">Excellent</SelectItem>
                    <SelectItem value="Master">Master</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select 
                  value={editingClass.class.level || ''} 
                  onValueChange={(value) => handleClassFieldChange('level', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Novice">Novice</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                    <SelectItem value="Excellent">Excellent</SelectItem>
                    <SelectItem value="Master">Master</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="section">Section (Optional)</Label>
                <Select 
                  value={editingClass.class.section || 'none'} 
                  onValueChange={(value) => handleClassFieldChange('section', value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Section</SelectItem>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={editingClass.class.description || ''}
                  onChange={(e) => handleClassFieldChange('description', e.target.value)}
                  placeholder="Additional notes about this class"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveClass}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateEditorPage;