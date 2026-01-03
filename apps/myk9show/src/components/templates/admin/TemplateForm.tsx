import React from 'react';
import { ClassTemplate, Organization, ShowType } from '../../../types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import { Badge } from '../../ui/badge';
import { Calendar, Shield, FileText } from 'lucide-react';

interface TemplateFormProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export const TemplateForm: React.FC<TemplateFormProps> = ({
  template,
  onChange,
  readOnly = false
}) => {
  const organizations = Object.values(Organization);
  const showTypes = Object.values(ShowType);

  const handleChange = (field: keyof ClassTemplate, value: string | boolean | Organization | ShowType) => {
    if (readOnly) return;
    onChange({ [field]: value });
  };


  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name *</Label>
              <Input
                id="templateName"
                value={template.templateName || ""}
                onChange={(e) => handleChange('templateName', e.target.value)}
                placeholder="Enter template name"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={template.version || ""}
                onChange={(e) => handleChange('version', e.target.value)}
                placeholder="1.0.0"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization">Organization *</Label>
              <Select 
                value={template.organization || ""} 
                onValueChange={(value) => handleChange('organization', value as Organization)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map(org => (
                    <SelectItem key={org} value={org}>{org}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="showType">Show Type *</Label>
              <Select 
                value={template.showType || ""} 
                onValueChange={(value) => handleChange('showType', value as ShowType)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select show type" />
                </SelectTrigger>
                <SelectContent>
                  {showTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={template.description || ""}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describe what this template is for and any special considerations"
              rows={3}
              disabled={readOnly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rulesReference">Official Rules Reference</Label>
            <Input
              id="rulesReference"
              value={template.officialRulesReference || ""}
              onChange={(e) => handleChange('officialRulesReference', e.target.value)}
              placeholder="e.g., AKC Scent Work Judge's Guidelines (2024)"
              disabled={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* Template Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Template Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Active Status</Label>
              <p className="text-sm text-muted-foreground">
                Only active templates are available for use
              </p>
            </div>
            <Switch
              checked={template.isActive || false}
              onCheckedChange={(checked: boolean) => handleChange('isActive', checked)}
              disabled={readOnly}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Official Template</Label>
              <p className="text-sm text-muted-foreground">
                Official templates cannot be deleted and have restricted editing
              </p>
            </div>
            <Switch
              checked={template.isOfficial || false}
              onCheckedChange={(checked: boolean) => handleChange('isOfficial', checked)}
              disabled={readOnly}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Custom Template</Label>
              <p className="text-sm text-muted-foreground">
                Custom templates can be fully modified and deleted
              </p>
            </div>
            <Switch
              checked={template.isCustom || false}
              onCheckedChange={(checked: boolean) => handleChange('isCustom', checked)}
              disabled={readOnly}
            />
          </div>

          <div className="flex gap-2 pt-2">
            {template.isOfficial && (
              <Badge variant="default">
                <Shield className="w-3 h-3 mr-1" />
                Official
              </Badge>
            )}
            {template.isCustom && (
              <Badge variant="secondary">Custom</Badge>
            )}
            {template.isActive ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-200">Active</Badge>
            ) : (
              <Badge variant="outline" className="text-destructive border-destructive/20">Inactive</Badge>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Template Statistics */}
      {template.classDefinitions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Template Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {template.classDefinitions.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Classes</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">
                  {template.fieldSpecifications?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Field Specifications</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-violet-600">
                  {template.validationRules?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Validation Rules</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">
                  {template.version || '1.0.0'}
                </div>
                <div className="text-sm text-muted-foreground">Version</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {readOnly && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="pt-4">
            <p className="text-amber-800 dark:text-amber-200 text-sm">
              <Shield className="inline w-4 h-4 mr-1" />
              This is an official template and cannot be modified. You can duplicate it to create a custom version.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};