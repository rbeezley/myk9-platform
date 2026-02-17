/**
 * ShowEditFeesTab - Entry fees and limits tab for the show edit form
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { DollarSign } from 'lucide-react';
import type { ShowEditFormData } from './ShowEditPanel.types';
import { cn } from '@/lib/utils';

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
            <div className="space-y-2">
              <Label
                htmlFor="preEntryFee"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                Pre-Entry Fee
              </Label>
              <Input
                id="preEntryFee"
                value={data.preEntryFee}
                onChange={handleInputChange('preEntryFee')}
                placeholder="$25.00"
                className={cn(
                  errors.some(e => e.includes('Pre-entry fee')) && 'border-destructive'
                )}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="dayOfShowFee"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                Day of Show Fee
              </Label>
              <Input
                id="dayOfShowFee"
                value={data.dayOfShowFee}
                onChange={handleInputChange('dayOfShowFee')}
                placeholder="$35.00"
                className={cn(
                  errors.some(e => e.includes('Day of show fee')) && 'border-destructive'
                )}
              />
            </div>
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
              <div className="space-y-2">
                <Label
                  htmlFor="maxEntriesPerDog"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Max Entries Per Dog
                </Label>
                <Input
                  id="maxEntriesPerDog"
                  type="number"
                  value={data.maxEntriesPerDog || ''}
                  onChange={handleInputChange('maxEntriesPerDog')}
                  placeholder="Unlimited"
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="maxTotalEntries"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Max Total Entries
                </Label>
                <Input
                  id="maxTotalEntries"
                  type="number"
                  value={data.maxTotalEntries || ''}
                  onChange={handleInputChange('maxTotalEntries')}
                  placeholder="Unlimited"
                  min="1"
                />
              </div>
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
