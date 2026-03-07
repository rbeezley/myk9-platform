import React, { useState, useMemo } from 'react';
import { TrialType } from '@/types/template.types';
import {
  TemplateFieldConfiguration,
  FieldDefinition,
  FieldCategory,
  TrialTypeField,
} from '@/types/field-definition-types';
import { getFieldsForTrialType } from '@/data/fieldDefinitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FieldConfiguratorProps, CategoryFilter } from './FieldConfigurator.types';
import {
  filterFields,
  groupFieldsByCategory,
  isFieldConfigured,
  getFieldConfig,
  createDefaultFieldConfig,
  getConfiguredCount,
  getTotalCount,
} from './FieldConfigurator.helpers';
import { FieldCard } from './FieldCard';
import { FieldConfigDialog } from './FieldConfigDialog';

export const FieldConfigurator: React.FC<FieldConfiguratorProps> = ({
  template,
  onChange,
  readOnly = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<FieldDefinition | null>(null);

  const fieldConfigs = template.fieldConfigurations || [];

  const availableFields = useMemo(() => {
    if (!template.trialType) return [];
    return getFieldsForTrialType(template.trialType as TrialType);
  }, [template.trialType]);

  const filteredFields = useMemo(
    () => filterFields(availableFields, selectedCategory, searchTerm),
    [availableFields, selectedCategory, searchTerm]
  );

  const fieldsByCategory = useMemo(() => groupFieldsByCategory(filteredFields), [filteredFields]);

  const toggleField = (field: FieldDefinition) => {
    if (readOnly) return;

    const existingConfig = getFieldConfig(field.fieldName, fieldConfigs);

    if (existingConfig) {
      const newConfigs = fieldConfigs.filter(c => c.fieldName !== field.fieldName);
      onChange({ fieldConfigurations: newConfigs });
    } else {
      const newConfig = createDefaultFieldConfig(field, fieldConfigs.length + 1);
      onChange({ fieldConfigurations: [...fieldConfigs, newConfig] });
    }
  };

  const openFieldConfig = (field: FieldDefinition) => {
    if (readOnly) return;
    setSelectedField(field);
    setConfigDialogOpen(true);
  };

  const updateFieldConfig = (
    fieldName: TrialTypeField,
    updates: Partial<TemplateFieldConfiguration>
  ) => {
    const newConfigs = fieldConfigs.map(config =>
      config.fieldName === fieldName ? { ...config, ...updates } : config
    );
    onChange({ fieldConfigurations: newConfigs });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Field Configuration</h3>
        <p className="text-muted-foreground">
          Select which fields will be available for classes created from this template
        </p>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{fieldConfigs.length}</div>
              <div className="text-sm text-muted-foreground">Selected Fields</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {fieldConfigs.filter(c => c.required).length}
              </div>
              <div className="text-sm text-muted-foreground">Required</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {fieldConfigs.filter(c => c.conditionalRules?.length).length}
              </div>
              <div className="text-sm text-muted-foreground">Conditional</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">{availableFields.length}</div>
              <div className="text-sm text-muted-foreground">Available</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={v => setSelectedCategory(v as CategoryFilter)}>
        <TabsList className="grid grid-cols-4 lg:grid-cols-7 w-full">
          <TabsTrigger value="all">All ({availableFields.length})</TabsTrigger>
          {Object.values(FieldCategory).map(category => (
            <TabsTrigger key={category} value={category}>
              <span className="hidden lg:inline">{category}</span>
              <span className="lg:hidden">{category.slice(0, 3)}</span>
              <Badge variant="outline" className="ml-2 text-xs">
                {getConfiguredCount(availableFields, category, fieldConfigs)}/
                {getTotalCount(availableFields, category)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-6">
          {selectedCategory === 'all' ? (
            <div className="space-y-6">
              {Object.entries(fieldsByCategory).map(
                ([category, fields]) =>
                  fields.length > 0 && (
                    <Card key={category}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>{category}</span>
                          <Badge variant="outline">
                            {
                              fields.filter(f => isFieldConfigured(f.fieldName, fieldConfigs))
                                .length
                            }{' '}
                            / {fields.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-3">
                          {fields.map(field => (
                            <FieldCard
                              key={field.id}
                              field={field}
                              isConfigured={isFieldConfigured(field.fieldName, fieldConfigs)}
                              config={getFieldConfig(field.fieldName, fieldConfigs)}
                              readOnly={readOnly}
                              onToggle={toggleField}
                              onConfigure={openFieldConfig}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-3">
                  {fieldsByCategory[selectedCategory as FieldCategory].length > 0 ? (
                    fieldsByCategory[selectedCategory as FieldCategory].map(field => (
                      <FieldCard
                        key={field.id}
                        field={field}
                        isConfigured={isFieldConfigured(field.fieldName, fieldConfigs)}
                        config={getFieldConfig(field.fieldName, fieldConfigs)}
                        readOnly={readOnly}
                        onToggle={toggleField}
                        onConfigure={openFieldConfig}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No fields found in this category
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Field Configuration Dialog */}
      {selectedField && (
        <FieldConfigDialog
          key={selectedField.fieldName}
          field={selectedField}
          config={getFieldConfig(selectedField.fieldName, fieldConfigs)}
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={updates => {
            updateFieldConfig(selectedField.fieldName, updates);
            setConfigDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};
