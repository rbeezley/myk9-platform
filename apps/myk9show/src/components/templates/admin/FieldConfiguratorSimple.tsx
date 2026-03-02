import React from 'react';
import { ClassTemplate } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FieldConfiguratorProps {
  template: Partial<ClassTemplate>;
  onChange: (updates: Partial<ClassTemplate>) => void;
  readOnly?: boolean;
}

export const FieldConfiguratorSimple: React.FC<FieldConfiguratorProps> = ({
  template,
  readOnly = false
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Field Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-muted-foreground">
            This is a simplified field configurator. Template: {template.templateName}
          </p>
          <p className="text-sm text-muted-foreground">
            Show Type: {template.trialType} | Organization: {template.organization}
          </p>
          <p className="text-sm text-muted-foreground">
            Read Only: {readOnly ? 'Yes' : 'No'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FieldConfiguratorSimple;