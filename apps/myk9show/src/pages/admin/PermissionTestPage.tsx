import React from 'react';
import { PermissionTestChecklist } from '@/components/admin/PermissionTestChecklist';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

export default function PermissionTestPage() {
  return (
    <div className="container mx-auto pt-20 pb-8 max-w-6xl">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold">RBAC Permission Testing</h1>
          <p className="text-muted-foreground mt-2">
            Test and verify role-based access control permissions across the application
          </p>
        </div>

        {/* Information Alert */}
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            This page helps verify that the RBAC system is working correctly. Switch between
            different roles and test various features to ensure proper access control.
          </AlertDescription>
        </Alert>

        {/* Test Checklist */}
        <PermissionTestChecklist />

        {/* Phase 1.2 Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Phase 1.2 Verification Checklist</CardTitle>
            <CardDescription>
              Manual verification steps for secretary permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold">Secretary Role Tests:</h3>
                <div className="space-y-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Create Show button visible on Calendar page</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Clone Show button visible on Calendar page</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Can access Show Creation Wizard</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Three-dot menu shows Edit/Delete options in show details</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Add Trial button is visible and functional</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Can edit trial details</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Can delete trials</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Show Dashboard displays all admin quick actions</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Exhibitor Role Tests:</h3>
                <div className="space-y-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✗ Create/Clone Show buttons NOT visible</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✗ Three-dot menu does NOT show admin options</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✗ Add Trial button NOT visible</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✗ Cannot edit/delete trials</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Can only view show information</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>✓ Can register for shows</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Edge Cases to Test:</h3>
                <div className="space-y-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>Test permission persistence after page refresh</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>Verify no console errors when switching roles</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>Check that unauthorized API calls are properly blocked</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>Ensure UI updates immediately when role changes</span>
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}