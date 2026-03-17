/**
 * ShowEditBasicInfoTab - Basic Information tab for the show edit form
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/common/FormField';
import { findFieldError } from '@/lib/validation';
import type { ShowEditFormData } from './ShowEditPanel.types';

interface ShowEditBasicInfoTabProps {
  data: ShowEditFormData;
  errors: string[];
  availableShowTypes: string[];
  clubs: Array<{ id: string; name: string; clubNumber: string }>;
  handleInputChange: (
    field: keyof ShowEditFormData
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSelectChange: (field: keyof ShowEditFormData) => (value: string) => void;
  handleDateChange: (field: keyof ShowEditFormData) => (date: Date | undefined) => void;
}

export const ShowEditBasicInfoTab: React.FC<ShowEditBasicInfoTabProps> = ({
  data,
  errors,
  availableShowTypes,
  clubs,
  handleInputChange,
  handleSelectChange,
  handleDateChange,
}) => {
  const nameError = findFieldError(errors, 'show name');
  const clubError = findFieldError(errors, 'club');
  const startDateError = findFieldError(errors, 'start date');
  const endDateError = findFieldError(errors, 'end date');
  const entryOpenError = findFieldError(errors, 'entry open');
  const entryCloseError = findFieldError(errors, 'entry close');

  return (
    <TabsContent
      value="basic"
      className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
    >
      <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Show Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Show Name" fieldId="name" required error={nameError}>
              <Input
                id="name"
                value={data.name}
                onChange={handleInputChange('name')}
                placeholder="Enter show name"
                className={nameError ? 'border-destructive' : ''}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'name-error' : undefined}
              />
            </FormField>

            <FormField label="Organization" fieldId="organization">
              <Select value={data.organization} onValueChange={handleSelectChange('organization')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {availableShowTypes.length > 0 ? (
                    availableShowTypes.map(showType => (
                      <SelectItem key={showType} value={showType}>
                        {showType}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem
                      value="no-templates"
                      disabled
                      className="text-sm text-muted-foreground italic"
                    >
                      No active templates available. Please create templates first.
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Status" fieldId="status">
              <Select value={data.status} onValueChange={handleSelectChange('status')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    <div>
                      <div className="font-medium">Draft</div>
                      <div className="text-xs text-muted-foreground">
                        Work in progress — not visible to exhibitors
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="published">
                    <div>
                      <div className="font-medium">Published</div>
                      <div className="text-xs text-muted-foreground">
                        Live and accepting entries
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="upcoming">
                    <div>
                      <div className="font-medium">Upcoming</div>
                      <div className="text-xs text-muted-foreground">
                        Entries closed, show is coming up
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <div>
                      <div className="font-medium">In Progress</div>
                      <div className="text-xs text-muted-foreground">Show is actively running</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div>
                      <div className="font-medium">Completed</div>
                      <div className="text-xs text-muted-foreground">
                        Show is finished, results finalized
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <div>
                      <div className="font-medium text-red-600">Cancelled</div>
                      <div className="text-xs text-muted-foreground">Show has been cancelled</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Hosting Club" fieldId="clubId" required error={clubError}>
            <Select value={data.clubId} onValueChange={handleSelectChange('clubId')}>
              <SelectTrigger
                className={clubError ? 'border-destructive' : ''}
                aria-invalid={!!clubError}
                aria-describedby={clubError ? 'clubId-error' : undefined}
              >
                <SelectValue placeholder="Select hosting club">
                  {data.clubId
                    ? (() => {
                        const club = clubs.find(c => c.id === data.clubId);
                        return club ? `${club.name} (${club.clubNumber})` : 'Loading...';
                      })()
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clubs.length > 0 ? (
                  clubs.map(club => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name} ({club.clubNumber})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem
                    value="no-clubs"
                    disabled
                    className="text-sm text-muted-foreground italic"
                  >
                    No clubs available. Add clubs in the Clubs section.
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Location" fieldId="location">
            <Input
              id="location"
              value={data.location}
              onChange={handleInputChange('location')}
              placeholder="Enter show location"
            />
          </FormField>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Important Dates
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Start Date" fieldId="startDate" required error={startDateError}>
                <DateTimePicker
                  value={data.startDate ? new Date(data.startDate) : undefined}
                  onChange={handleDateChange('startDate')}
                  placeholder="Select start date"
                  showTime={true}
                  className={startDateError ? 'border-destructive' : ''}
                />
              </FormField>

              <FormField label="End Date" fieldId="endDate" required error={endDateError}>
                <DateTimePicker
                  value={data.endDate ? new Date(data.endDate) : undefined}
                  onChange={handleDateChange('endDate')}
                  placeholder="Select end date"
                  showTime={true}
                  className={endDateError ? 'border-destructive' : ''}
                />
              </FormField>

              <FormField label="Entry Open Date" fieldId="entryOpenDate" error={entryOpenError}>
                <DateTimePicker
                  value={data.entryOpenDate ? new Date(data.entryOpenDate) : undefined}
                  onChange={handleDateChange('entryOpenDate')}
                  placeholder="Select entry open date"
                  showTime={true}
                  className={entryOpenError ? 'border-destructive' : ''}
                />
              </FormField>

              <FormField label="Entry Close Date" fieldId="entryCloseDate" error={entryCloseError}>
                <DateTimePicker
                  value={data.entryCloseDate ? new Date(data.entryCloseDate) : undefined}
                  onChange={handleDateChange('entryCloseDate')}
                  placeholder="Select entry close date"
                  showTime={true}
                  className={entryCloseError ? 'border-destructive' : ''}
                />
              </FormField>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};
