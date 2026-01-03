import React, { useState, useEffect } from 'react';
import { useTemplateStore } from '@/store/templateStore';
import { Organization, ShowType, ClassTemplate } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Building2, 
  Trophy, 
  ChevronRight, 
  Calendar,
  Users,
  Settings,
  CheckCircle
} from 'lucide-react';

interface OrganizationSelectorProps {
  onTemplateSelected: (template: ClassTemplate) => void;
  selectedOrganization?: Organization;
  selectedShowType?: ShowType;
  selectedTemplate?: ClassTemplate;
}

export const OrganizationSelector: React.FC<OrganizationSelectorProps> = ({
  onTemplateSelected,
  selectedOrganization,
  selectedShowType,
  selectedTemplate
}) => {
  const { templates } = useTemplateStore();
  const [organization, setOrganization] = useState<Organization | undefined>(selectedOrganization);
  const [showType, setShowType] = useState<ShowType | undefined>(selectedShowType);
  const [availableTemplates, setAvailableTemplates] = useState<ClassTemplate[]>([]);

  // Get unique organizations and show types from templates
  const organizations = Array.from(new Set(templates.filter(t => t.isActive).map(t => t.organization))) as Organization[];
  const showTypes = organization 
    ? Array.from(new Set(templates.filter((t: ClassTemplate) => t.organization === organization && t.isActive).map((t: ClassTemplate) => t.showType))) as ShowType[]
    : [];

  // Update available templates when organization or show type changes
  useEffect(() => {
    if (organization && showType) {
      const filtered = templates.filter(t => 
        t.isActive && 
        t.organization === organization && 
        t.showType === showType
      );
      setAvailableTemplates(filtered);
    } else if (organization) {
      setAvailableTemplates(templates.filter((t: ClassTemplate) => t.organization === organization && t.isActive));
    } else {
      setAvailableTemplates([]);
    }
  }, [organization, showType, templates]);

  const handleOrganizationChange = (value: Organization) => {
    setOrganization(value);
    setShowType(undefined);
    setAvailableTemplates([]);
  };

  const handleShowTypeChange = (value: ShowType) => {
    setShowType(value);
  };

  const handleTemplateSelect = (template: ClassTemplate) => {
    onTemplateSelected(template);
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Organization Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Step 1: Select Organization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Select value={organization || ""} onValueChange={handleOrganizationChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an organization..." />
              </SelectTrigger>
              <SelectContent>
                {organizations.map(org => (
                  <SelectItem key={org} value={org}>
                    {org}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {organization && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">{organization} selected</span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  {templates.filter((t: ClassTemplate) => t.organization === organization && t.isActive).length} templates available
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Show Type Selection */}
      {organization && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Step 2: Select Show Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Select value={showType || ""} onValueChange={handleShowTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a show type..." />
                </SelectTrigger>
                <SelectContent>
                  {showTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {showType && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-800">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">{showType} selected</span>
                  </div>
                  <p className="text-sm text-blue-700 mt-1">
                    {availableTemplates.length} template(s) available for {organization} {showType}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Template Selection */}
      {organization && showType && availableTemplates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Step 3: Select Template
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4">
                {availableTemplates.map(template => (
                  <div
                    key={template.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedTemplate?.id === template.id
                        ? 'ring-2 ring-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{template.templateName}</h4>
                          <Badge variant={template.isOfficial ? "default" : "secondary"}>
                            {template.isOfficial ? 'Official' : 'Custom'}
                          </Badge>
                          <Badge variant="outline">v{template.version}</Badge>
                        </div>
                        
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            <span>{template.classDefinitions.length} classes</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-green-500" />
                            <span>{template.fieldSpecifications.length} fields</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-purple-500" />
                            <span>${template.defaults?.entryFees?.preEntry} entry</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {template.defaults?.judgingTimeEstimate || 'N/A'} min judging
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        {selectedTemplate?.id === template.id ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedTemplate && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-800 mb-2">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Template Selected: {selectedTemplate.templateName}</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Ready to preview and select classes. This template includes {selectedTemplate.classDefinitions.length} classes 
                    with {selectedTemplate.fieldSpecifications.length} configurable fields.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Templates Available */}
      {organization && showType && availableTemplates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Templates Available</h3>
            <p className="text-muted-foreground text-center">
              There are no active templates for {organization} {showType}. 
              Contact your site administrator to create templates for this organization and show type.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};