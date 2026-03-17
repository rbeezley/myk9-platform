/**
 * ShowEditFeesTab - Entry fees and limits tab for the show edit form
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DollarSign } from 'lucide-react';
import { FormField } from '@/components/common/FormField';
import { findFieldError } from '@/lib/validation';
import type { ShowEditFormData } from './ShowEditPanel.types';

interface ShowEditFeesTabProps {
  data: ShowEditFormData;
  errors: string[];
  handleInputChange: (
    field: keyof ShowEditFormData
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleCheckboxChange: (field: keyof ShowEditFormData) => (checked: boolean) => void;
}

export const ShowEditFeesTab: React.FC<ShowEditFeesTabProps> = ({
  data,
  errors,
  handleInputChange,
  handleCheckboxChange,
}) => {
  const preEntryFeeError = findFieldError(errors, 'pre-entry fee');
  const dayOfShowFeeError = findFieldError(errors, 'day of show fee');

  const handleFeeChange = (field: keyof ShowEditFormData) => (value: number) => {
    const handler = handleInputChange(field);
    handler({ target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <TabsContent
      value="fees"
      className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
    >
      <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Entry Fees
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
            <FormField label="Pre-Entry Fee" fieldId="preEntryFee" error={preEntryFeeError}>
              <CurrencyInput
                id="preEntryFee"
                value={data.preEntryFee}
                onChange={handleFeeChange('preEntryFee')}
                placeholder="0.00"
                className={preEntryFeeError ? 'border-destructive' : ''}
                aria-invalid={!!preEntryFeeError}
                aria-describedby={preEntryFeeError ? 'preEntryFee-error' : undefined}
              />
            </FormField>

            <FormField label="Day of Show Fee" fieldId="dayOfShowFee" error={dayOfShowFeeError}>
              <CurrencyInput
                id="dayOfShowFee"
                value={data.dayOfShowFee}
                onChange={handleFeeChange('dayOfShowFee')}
                placeholder="0.00"
                className={dayOfShowFeeError ? 'border-destructive' : ''}
                aria-invalid={!!dayOfShowFeeError}
                aria-describedby={dayOfShowFeeError ? 'dayOfShowFee-error' : undefined}
              />
            </FormField>
          </div>

          <p className="text-sm text-muted-foreground">
            These fees will be used as defaults for each class and can be adjusted per class as
            needed.
          </p>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Entry Limits (Optional)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
              <FormField label="Max Entries Per Dog" fieldId="maxEntriesPerDog">
                <Input
                  id="maxEntriesPerDog"
                  type="number"
                  value={data.maxEntriesPerDog || ''}
                  onChange={handleInputChange('maxEntriesPerDog')}
                  placeholder="Unlimited"
                  min="1"
                />
              </FormField>

              <FormField label="Max Total Entries" fieldId="maxTotalEntries">
                <Input
                  id="maxTotalEntries"
                  type="number"
                  value={data.maxTotalEntries || ''}
                  onChange={handleInputChange('maxTotalEntries')}
                  placeholder="Unlimited"
                  min="1"
                />
              </FormField>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="allowNonOwnerHandlers"
                checked={data.allowNonOwnerHandlers || false}
                onCheckedChange={handleCheckboxChange('allowNonOwnerHandlers')}
              />
              <Label htmlFor="allowNonOwnerHandlers" className="text-sm font-medium">
                Allow non-owner handlers
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};
