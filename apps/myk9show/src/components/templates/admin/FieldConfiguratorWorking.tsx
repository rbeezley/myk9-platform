import React, { useState } from 'react';
import { ClassTemplate } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { logger } from '@/services/LoggingService';

interface FieldConfiguratorProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export const FieldConfiguratorWorking: React.FC<FieldConfiguratorProps> = ({
  template,
  readOnly = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Field Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure fields for {template.trialType} templates
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Field Categories */}
            <div>
              <h4 className="font-semibold mb-2">Field Categories</h4>
              <div className="flex gap-2 flex-wrap">
                {['all', 'identity', 'scheduling', 'competition', 'personnel'].map(category => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Current Fields */}
            <div>
              <h4 className="font-semibold mb-2">
                Current Fields ({template.fieldSpecifications?.length || 0})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {template.fieldSpecifications?.map((field, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <strong>{field.displayName}</strong>
                        <Badge variant="secondary" className="text-xs">
                          {field.dataType}
                        </Badge>
                        {field.required && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {field.fieldName} • {field.description || 'No description'}
                      </p>
                    </div>
                    {!readOnly && (
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    )}
                  </div>
                )) || (
                  <p className="text-muted-foreground py-4 text-center">No fields configured yet</p>
                )}
              </div>
            </div>

            {!readOnly && (
              <div className="pt-4">
                <Button onClick={() => logger.debug('Add field clicked', 'templates', {})}>
                  <Plus className="h-4 w-4" />
                  Add Field
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Field Configurations Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Field Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{template.fieldSpecifications?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Total Fields</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {template.fieldSpecifications?.filter(f => f.required).length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Required</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {template.fieldSpecifications?.filter(f => f.editable).length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Editable</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {new Set(template.fieldSpecifications?.map(f => f.dataType)).size || 0}
              </div>
              <div className="text-sm text-muted-foreground">Data Types</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FieldConfiguratorWorking;
