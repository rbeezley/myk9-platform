import React from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';
import { FormField } from '@/components/common/FormField';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import type { DogFormData } from './types';

export const AdditionalInfoTab: React.FC = () => {
  const { form } = useEditPanel<DogFormData>();

  if (!form) return null;

  const { data: formData } = form;

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
          <FormField label="Height (inches)" fieldId="height">
            <Input
              id="height"
              value={formData.height}
              onChange={e => form.setValue('height', e.target.value)}
              placeholder="e.g., 24"
              type="number"
              step="0.1"
            />
          </FormField>

          <FormField label="Weight (pounds)" fieldId="weight">
            <Input
              id="weight"
              value={formData.weight}
              onChange={e => form.setValue('weight', e.target.value)}
              placeholder="e.g., 55"
              type="number"
              step="0.1"
            />
          </FormField>

          <FormField label="Microchip Number" fieldId="microchip" className="md:col-span-2">
            <Input
              id="microchip"
              value={formData.microchip}
              onChange={e => form.setValue('microchip', e.target.value)}
              placeholder="15-digit microchip number"
            />
          </FormField>
        </div>

        <div className="flex items-center space-x-3">
          <Checkbox
            id="spayedNeutered"
            checked={formData.spayedNeutered}
            onCheckedChange={checked => form.setValue('spayedNeutered', checked === true)}
          />
          <Label htmlFor="spayedNeutered" className="text-sm font-medium cursor-pointer">
            Spayed/Neutered
          </Label>
        </div>
      </CardContent>
    </Card>
  );
};
