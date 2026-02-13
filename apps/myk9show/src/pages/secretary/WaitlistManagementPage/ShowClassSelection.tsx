/**
 * Show and Class Selection component for WaitlistManagementPage
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Trophy } from 'lucide-react';
import type { Show, ClassWithWaitlistCount } from './types';
import { formatDate } from './utils';

interface ShowClassSelectionProps {
  shows: Show[];
  selectedShowId: string;
  onShowChange: (showId: string) => void;
  isLoadingShows: boolean;
  classes: ClassWithWaitlistCount[];
  selectedClassId: string;
  onClassChange: (classId: string) => void;
  isLoadingClasses: boolean;
}

export const ShowClassSelection: React.FC<ShowClassSelectionProps> = ({
  shows,
  selectedShowId,
  onShowChange,
  isLoadingShows,
  classes,
  selectedClassId,
  onClassChange,
  isLoadingClasses,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Select Show and Class</CardTitle>
        <CardDescription>Choose a show and class to manage its waitlist</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Show Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Show</label>
            <Select
              value={selectedShowId}
              onValueChange={onShowChange}
              disabled={isLoadingShows}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingShows ? 'Loading shows...' : 'Select a show'} />
              </SelectTrigger>
              <SelectContent>
                {shows.map((show) => (
                  <SelectItem key={show.id} value={show.id}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{show.name || 'Unnamed Show'}</span>
                      <span className="text-muted-foreground text-xs">
                        ({formatDate(show.start_date)})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Class</label>
            <Select
              value={selectedClassId}
              onValueChange={onClassChange}
              disabled={!selectedShowId || isLoadingClasses}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedShowId
                      ? 'Select a show first'
                      : isLoadingClasses
                        ? 'Loading classes...'
                        : 'Select a class'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {cls.class_number ? `#${cls.class_number} - ` : ''}
                        {cls.name}
                      </span>
                      {cls.waitlist_count > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {cls.waitlist_count} waiting
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
