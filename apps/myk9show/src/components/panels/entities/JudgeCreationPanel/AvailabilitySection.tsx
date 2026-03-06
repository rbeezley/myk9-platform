import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AvailabilityFormFields from '@/components/judges/AvailabilityFormFields';
import type { JudgeFormData } from './types';

interface AvailabilitySectionProps {
  formData: JudgeFormData;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAvailabilityChange: (field: keyof JudgeFormData['availability'], value: unknown) => void;
}

export const AvailabilitySection: React.FC<AvailabilitySectionProps> = ({
  formData,
  isExpanded,
  onToggleExpanded,
  onAvailabilityChange,
}) => {
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggleExpanded}>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Availability Settings</span>
          <span className="text-sm font-normal text-muted-foreground">Optional</span>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <AvailabilityFormFields
            availability={formData.availability}
            onFieldChange={onAvailabilityChange}
          />
        </CardContent>
      )}
    </Card>
  );
};
