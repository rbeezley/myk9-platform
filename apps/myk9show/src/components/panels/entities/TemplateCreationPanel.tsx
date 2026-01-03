import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { BasePanelProps } from '../types';

interface TemplateCreationPanelProps extends BasePanelProps {
  templateType?: 'class' | 'show';
  onStateChange?: (state: { isLoading: boolean; error: string | null; isDirty: boolean; isValid: boolean }) => void;
}

export const TemplateCreationPanel: React.FC<TemplateCreationPanelProps> = ({
  onStateChange,
}) => {
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);
  const [isDirty] = useState(false);
  const isValid = true; // Placeholder

  useEffect(() => {
    onStateChange?.({
      isLoading,
      error,
      isDirty,
      isValid,
    });
  }, [isLoading, error, isDirty, isValid, onStateChange]);

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Create Custom Template</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Create a custom template for classes or shows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming Soon</CardTitle>
          <CardDescription>
            Template creation panel will be implemented in Phase 5.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This panel will allow creating custom templates for classes and shows with field validation and rules.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};