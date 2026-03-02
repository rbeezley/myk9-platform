/**
 * ShowEditBasicInfoTab - Basic Information tab for the show edit form
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { ShowEditFormData } from './ShowEditPanel.types';
import { cn } from '@/lib/utils';

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
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                Show Name *
              </Label>
              <Input
                id="name"
                value={data.name}
                onChange={handleInputChange('name')}
                placeholder="Enter show name"
                className={cn(errors.some(e => e.includes('Show name')) && 'border-destructive')}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="organization"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                Organization
              </Label>
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
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="status"
                className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
              >
                Status
              </Label>
              <Select value={data.status} onValueChange={handleSelectChange('status')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    <div>
                      <div className="font-medium">Draft</div>
                      <div className="text-xs text-muted-foreground">
                        Work in progress - only visible to you
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="unpublished">
                    <div>
                      <div className="font-medium">Ready (Unpublished)</div>
                      <div className="text-xs text-muted-foreground">
                        Complete but not visible to exhibitors
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="published">
                    <div>
                      <div className="font-medium">Published</div>
                      <div className="text-xs text-muted-foreground">
                        Live and accepting registrations
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
              {data.status === 'published' && data.startDate && (
                <p className="text-xs text-muted-foreground">
                  Show is{' '}
                  {new Date() < new Date(data.startDate)
                    ? 'upcoming'
                    : new Date() > new Date(data.endDate || data.startDate)
                      ? 'completed'
                      : 'in progress'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="clubId"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Hosting Club *
            </Label>
            <Select value={data.clubId} onValueChange={handleSelectChange('clubId')}>
              <SelectTrigger
                className={cn(errors.some(e => e.includes('club')) && 'border-destructive')}
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
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="location"
              className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
            >
              Location
            </Label>
            <Input
              id="location"
              value={data.location}
              onChange={handleInputChange('location')}
              placeholder="Enter show location"
            />
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Important Dates
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="startDate"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Start Date *
                </Label>
                <DateTimePicker
                  value={data.startDate ? new Date(data.startDate) : undefined}
                  onChange={handleDateChange('startDate')}
                  placeholder="Select start date"
                  showTime={true}
                  className={cn(errors.some(e => e.includes('Start date')) && 'border-destructive')}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="endDate"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  End Date *
                </Label>
                <DateTimePicker
                  value={data.endDate ? new Date(data.endDate) : undefined}
                  onChange={handleDateChange('endDate')}
                  placeholder="Select end date"
                  showTime={true}
                  className={cn(errors.some(e => e.includes('End date')) && 'border-destructive')}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="entryOpenDate"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Entry Open Date
                </Label>
                <DateTimePicker
                  value={data.entryOpenDate ? new Date(data.entryOpenDate) : undefined}
                  onChange={handleDateChange('entryOpenDate')}
                  placeholder="Select entry open date"
                  showTime={true}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="entryCloseDate"
                  className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase"
                >
                  Entry Close Date
                </Label>
                <DateTimePicker
                  value={data.entryCloseDate ? new Date(data.entryCloseDate) : undefined}
                  onChange={handleDateChange('entryCloseDate')}
                  placeholder="Select entry close date"
                  showTime={true}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};
