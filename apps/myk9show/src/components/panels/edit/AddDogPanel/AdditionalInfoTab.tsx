import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings } from 'lucide-react';
import type { TabSectionProps } from './types';

export const AdditionalInfoTab: React.FC<TabSectionProps> = ({
  formData,
  onFieldChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Additional Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="height" className="text-sm font-medium">Height (inches)</Label>
            <Input
              id="height"
              value={formData.height}
              onChange={(e) => onFieldChange('height', e.target.value)}
              placeholder="e.g., 24"
              type="number"
              step="0.1"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="weight" className="text-sm font-medium">Weight (pounds)</Label>
            <Input
              id="weight"
              value={formData.weight}
              onChange={(e) => onFieldChange('weight', e.target.value)}
              placeholder="e.g., 55"
              type="number"
              step="0.1"
              className="mt-1"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="microchip" className="text-sm font-medium">Microchip Number</Label>
            <Input
              id="microchip"
              value={formData.microchip}
              onChange={(e) => onFieldChange('microchip', e.target.value)}
              placeholder="15-digit microchip number"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Checkbox
            id="spayedNeutered"
            checked={formData.spayedNeutered}
            onCheckedChange={(checked) => onFieldChange('spayedNeutered', checked === true)}
          />
          <Label htmlFor="spayedNeutered" className="text-sm font-medium cursor-pointer">
            Spayed/Neutered
          </Label>
        </div>
      </CardContent>
    </Card>
  );
};
