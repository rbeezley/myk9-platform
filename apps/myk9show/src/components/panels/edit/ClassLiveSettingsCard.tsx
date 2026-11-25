import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Show Desk's class settings inside Edit class (MYK9-2379): status, judge (before the class
 * starts), scoring, expected start and stewards, each saved the moment it is changed by its own
 * control, so Save Changes never writes status or judge from the form's older copy
 * (`withoutLiveSettings`). The panel's own Status field gives way to these, and so does its Judge
 * while the live one is shown.
 */
export function ClassLiveSettingsCard({ children }: { children: ReactNode }) {
  return (
    <Card data-testid="class-live-settings">
      <CardHeader>
        <CardTitle>Show day</CardTitle>
        <p className="text-sm text-muted-foreground">Changes here save right away.</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
