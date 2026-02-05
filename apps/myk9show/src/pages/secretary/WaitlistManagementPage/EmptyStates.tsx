/**
 * Empty State components for WaitlistManagementPage
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ListOrdered } from 'lucide-react';

/**
 * Shown when user doesn't have secretary permissions
 */
export const AccessRestrictedState: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
          <p className="text-muted-foreground">
            This page is only accessible to users with secretary permissions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Shown when no show has been selected yet
 */
export const NoShowSelectedState: React.FC = () => {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <ListOrdered className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-medium mb-2">Select a Show to Begin</h3>
        <p className="text-muted-foreground">
          Choose a show from the dropdown above to view and manage its waitlists.
        </p>
      </CardContent>
    </Card>
  );
};
