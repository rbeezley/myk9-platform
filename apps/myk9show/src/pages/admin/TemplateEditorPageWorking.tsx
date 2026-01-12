import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTemplateStore } from '@/store/templateStore';
import { ClassTemplate, Organization, ShowType } from '@/types/template.types';
import { TemplateForm } from '@/components/templates/admin/TemplateForm';
import { TemplatePreview } from '@/components/templates/admin/TemplatePreview';
import { FieldConfiguratorWorking } from '@/components/templates/admin/FieldConfiguratorWorking';
import { RuleBuilder } from '@/components/templates/admin/RuleBuilder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
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

const TemplateEditorPageWorking: React.FC = () => {
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

  // Determine if template can be edited
  const editability = template.id ? useTemplateStore.getState().canEdit(template as ClassTemplate) : { canEdit: true };
  const canEdit = editability.canEdit;
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('basic');

  // Check if template can be edited using new flexible system
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
                    {template.isOfficial ? 'Official Template' : 'Template Notice'}
                  </h3>
                  <p className="text-amber-700 dark:text-amber-300 text-sm">
                    {editWarning}
                  </p>
                </div>
              </div>
              
              {template.isOfficial && templateId && (
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
          <FieldConfiguratorWorking 
            template={template}
            onChange={handleTemplateChange}
            readOnly={!canEdit}
          />
        </TabsContent>

        <TabsContent value="classes" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Class Definitions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Manage class definitions for this template
                  </p>
                  {canEdit && (
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Class
                    </Button>
                  )}
                </div>
                
                {template.classDefinitions && template.classDefinitions.length > 0 ? (
                  <div className="space-y-2">
                    {template.classDefinitions.map((classDef, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <strong>{classDef.className}</strong>
                          <p className="text-sm text-muted-foreground">
                            {classDef.element} {classDef.level} {classDef.section}
                          </p>
                        </div>
                        {canEdit && (
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No class definitions yet. Add classes to complete your template.
                  </div>
                )}
              </div>
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
    </div>
  );
};

export default TemplateEditorPageWorking;