import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, FileText, Settings, Eye } from 'lucide-react';
import { useTemplateStore } from '@/store/templateStore';
import { ClassTemplate, Organization, ShowType, TemplateStatus, TemplateType } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { logger } from '@/services/LoggingService';
import { toast } from 'sonner';

const TemplateEditorPageMinimal: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { getTemplate, createTemplate, updateTemplate } = useTemplateStore();
  
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

  // Load template on mount
  useEffect(() => {
    if (!isNew && templateId) {
      const existingTemplate = getTemplate(templateId);
      if (existingTemplate) {
        queueMicrotask(() => {
          setTemplate(existingTemplate);
        });
      } else {
        navigate('/admin/templates');
      }
    }
  }, [templateId, isNew, getTemplate, navigate]);

  const handleGoBack = () => {
    navigate('/admin/templates');
  };

  const [activeTab, setActiveTab] = useState('basic');
  const [hasChanges, setHasChanges] = useState(false);


  const handleSave = async () => {
    try {
      if (isNew) {
        const newTemplate = createTemplate({
          templateName: template.templateName || 'Untitled Template',
          organization: template.organization || Organization.AKC,
          showType: template.showType || ShowType.SCENT_WORK,
          version: template.version || '1.0.0',
          description: template.description,
          status: TemplateStatus.DRAFT,
          type: TemplateType.CUSTOM,
          isActive: template.isActive ?? true,
          isOfficial: false,
          isCustom: true,
          fieldConfigurations: template.fieldConfigurations || [],
          fieldSpecifications: template.fieldSpecifications || [],
          classDefinitions: template.classDefinitions || [],
          validationRules: template.validationRules || [],
          defaults: template.defaults || { entryFees: { preEntry: 25, dayOfShow: 30 } },
        });
        toast.success(`Template "${newTemplate.templateName}" created`);
        navigate(`/admin/templates/${newTemplate.id}`);
      } else if (templateId) {
        const { id: _id, createdAt: _ca, createdBy: _cb, ...updates } = template;
        const success = updateTemplate(templateId, updates);
        if (success) {
          toast.success('Template saved');
        } else {
          toast.error('Failed to save template');
          return;
        }
      }
      setHasChanges(false);
    } catch (error) {
      logger.error('Failed to save template:', 'admin', {}, error as Error);
      toast.error('An error occurred while saving');
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleGoBack}>
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
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges}
              className="min-w-[100px]"
            >
              <Save className="h-4 w-4 mr-2" />
              {isNew ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Editor Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="fields" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Template Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <strong>Template Name:</strong> {template.templateName || 'N/A'}
                  </div>
                  <div>
                    <strong>Organization:</strong> {template.organization || 'N/A'}
                  </div>
                  <div>
                    <strong>Show Type:</strong> {template.showType || 'N/A'}
                  </div>
                  <div>
                    <strong>Version:</strong> {template.version || 'N/A'}
                  </div>
                  <div>
                    <strong>Description:</strong> {template.description || 'No description'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fields" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Field Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Field configuration for {template.templateName}
                  </p>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Current Fields:</h4>
                    <div className="space-y-2">
                      {template.fieldSpecifications?.map((field, index) => (
                        <div key={index} className="p-2 border rounded">
                          <strong>{field.displayName}</strong> ({field.fieldName})
                          <br />
                          <span className="text-sm text-muted-foreground">
                            Type: {field.dataType} | Required: {field.required ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )) || <p className="text-muted-foreground">No fields configured</p>}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Column Configuration:</h4>
                    <div className="p-2 border rounded">
                      <p className="text-sm">
                        Table column configuration: {template.tableColumnConfig ? 'Configured' : 'Using defaults'}
                      </p>
                      {template.tableColumnConfig?.customColumns && (
                        <p className="text-sm text-muted-foreground">
                          Custom columns: {template.tableColumnConfig.customColumns.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <div className="border border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
              <h3 className="text-lg font-semibold mb-2">Template Preview</h3>
              <p className="text-muted-foreground">
                Preview functionality will be added next
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TemplateEditorPageMinimal;