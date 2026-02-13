/**
 * Class Statistics Cards component for WaitlistManagementPage
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CheckCircle2, Clock, ArrowUpCircle } from 'lucide-react';
import type { ClassWithWaitlistCount } from './types';

interface ClassStatsCardsProps {
  selectedClass: ClassWithWaitlistCount;
}

export const ClassStatsCards: React.FC<ClassStatsCardsProps> = ({ selectedClass }) => {
  const availableSpots = selectedClass.max_entries
    ? Math.max(0, selectedClass.max_entries - selectedClass.accepted_count)
    : null;

  const percentFull = selectedClass.max_entries
    ? Math.round((selectedClass.accepted_count / selectedClass.max_entries) * 100)
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Entry Limit</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {selectedClass.max_entries || '∞'}
          </div>
          <p className="text-xs text-muted-foreground">Maximum entries</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Accepted</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{selectedClass.accepted_count}</div>
          <p className="text-xs text-muted-foreground">
            {percentFull !== null ? `${percentFull}% full` : 'No limit set'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Waitlist</CardTitle>
          <Clock className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{selectedClass.waitlist_count}</div>
          <p className="text-xs text-muted-foreground">Waiting for spots</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Available</CardTitle>
          <ArrowUpCircle className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {availableSpots !== null ? availableSpots : '∞'}
          </div>
          <p className="text-xs text-muted-foreground">Open spots</p>
        </CardContent>
      </Card>
    </div>
  );
};
