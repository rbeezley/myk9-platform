import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { PERMISSIONS, UserRole, Permission } from '@/types/auth-types';
import { cn } from '@/lib/utils';

interface PermissionTest {
  id: string;
  name: string;
  description: string;
  permission?: Permission;
  role?: UserRole;
  testPath?: string;
  expectedResult: {
    [key in UserRole]?: boolean;
  };
}

const permissionTests: PermissionTest[] = [
  // Show Management Tests
  {
    id: 'show-create-button',
    name: 'Show Create Button Visibility',
    description: 'Create Show and Clone Show buttons on Calendar page',
    permission: PERMISSIONS.SHOW_CREATE,
    testPath: '/calendar',
    expectedResult: {
      [UserRole.EXHIBITOR]: false,
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
  {
    id: 'show-edit-menu',
    name: 'Show Edit Menu Access',
    description: 'Three-dot menu with Edit/Delete options in show details',
    permission: PERMISSIONS.SHOW_UPDATE,
    testPath: '/shows/*',
    expectedResult: {
      [UserRole.EXHIBITOR]: false,
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
  {
    id: 'trial-management',
    name: 'Trial Management Access',
    description: 'Add Trial button and trial edit/delete options',
    permission: PERMISSIONS.SHOW_MANAGE,
    testPath: '/shows/*',
    expectedResult: {
      [UserRole.EXHIBITOR]: false,
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
  {
    id: 'show-dashboard-actions',
    name: 'Show Dashboard Quick Actions',
    description: 'Admin quick actions on show dashboard',
    testPath: '/secretary/shows/*/dashboard',
    expectedResult: {
      [UserRole.EXHIBITOR]: false, // Should only see limited actions
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
  {
    id: 'browse-shows-actions',
    name: 'Browse Shows Page Actions',
    description: 'Create Show button on Browse Shows page',
    permission: PERMISSIONS.SHOW_CREATE,
    testPath: '/browse-shows',
    expectedResult: {
      [UserRole.EXHIBITOR]: false,
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
  // Entry Management Tests
  {
    id: 'entry-management',
    name: 'Entry Management Access',
    description: 'Manage Entries quick action',
    permission: PERMISSIONS.SHOW_MANAGE_ENTRIES,
    expectedResult: {
      [UserRole.EXHIBITOR]: false,
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
  // Judge Assignment Tests
  {
    id: 'judge-assignment',
    name: 'Judge Assignment Access',
    description: 'Assign judges to classes',
    permission: PERMISSIONS.SECRETARY_ASSIGN_JUDGES,
    expectedResult: {
      [UserRole.EXHIBITOR]: false,
      [UserRole.SECRETARY]: true,
      [UserRole.CLUB_ADMIN]: true,
      [UserRole.SITE_ADMIN]: true,
    },
  },
];

export function PermissionTestChecklist() {
  const { userWithRoles, hasPermission } = useAuthContext();
  const navigate = useNavigate();
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [testing, setTesting] = useState(false);

  const runTest = (test: PermissionTest) => {
    const currentRole = userWithRoles?.roles[0];
    if (!currentRole) return null;

    // Check if user has the required permission
    if (test.permission) {
      const hasAccess = hasPermission(test.permission);
      const expected = test.expectedResult[currentRole] ?? false;
      return hasAccess === expected;
    }

    // For tests without specific permissions, we'd need to actually navigate
    // and check DOM elements, which would require more complex testing
    return null;
  };

  const runAllTests = () => {
    setTesting(true);
    const results: Record<string, boolean | null> = {};

    permissionTests.forEach((test) => {
      results[test.id] = runTest(test);
    });

    setTestResults(results);
    setTesting(false);
  };

  const getTestIcon = (result: boolean | null) => {
    if (result === null) return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    if (result) return <CheckCircle className="h-5 w-5 text-green-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getTestStatus = (result: boolean | null) => {
    if (result === null) return 'Not Tested';
    if (result) return 'Pass';
    return 'Fail';
  };

  const currentRole = userWithRoles?.roles[0] || UserRole.EXHIBITOR;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Permission Test Checklist</span>
          <div className="flex items-center gap-4">
            <div className="text-sm font-normal">
              Current Role: <span className="font-semibold">{currentRole}</span>
            </div>
            <Button onClick={runAllTests} disabled={testing} size="sm">
              <RefreshCw className={cn("h-4 w-4 mr-2", testing && "animate-spin")} />
              Run Tests
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Role Switcher for Testing */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <h3 className="font-semibold mb-2">Test as Different Role:</h3>
            <div className="flex gap-2 flex-wrap">
              {Object.values(UserRole).map((role) => (
                <Button
                  key={role}
                  variant={currentRole === role ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    // Switch to mock user with this role
                    const mockEmails = {
                      [UserRole.EXHIBITOR]: 'exhibitor@example.com',
                      [UserRole.SECRETARY]: 'secretary@example.com',
                      [UserRole.JUDGE]: 'judge@example.com',
                      [UserRole.GATE_STEWARD]: 'gatesteward@example.com',
                      [UserRole.CLUB_ADMIN]: 'clubadmin@example.com',
                      [UserRole.SITE_ADMIN]: 'admin@example.com',
                    };
                    // Role switching not implemented - would require backend changes
                    console.log('Would switch to role:', role, 'with email:', mockEmails[role as keyof typeof mockEmails]);
                    setTestResults({}); // Clear results when switching roles
                  }}
                >
                  {role.replace('_', ' ').toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Test Results */}
          <div className="space-y-2">
            {permissionTests.map((test) => {
              const result = testResults[test.id];
              const expected = test.expectedResult[currentRole];
              
              return (
                <div
                  key={test.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getTestIcon(result)}
                        <h4 className="font-semibold">{test.name}</h4>
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-full",
                          result === null && "bg-gray-100 text-gray-600",
                          result === true && "bg-green-100 text-green-700",
                          result === false && "bg-red-100 text-red-700"
                        )}>
                          {getTestStatus(result)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {test.description}
                      </p>
                      {test.permission && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Permission: <code className="bg-muted px-1 py-0.5 rounded">{test.permission}</code>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected for {currentRole}: {expected ? 'Allowed' : 'Denied'}
                      </p>
                    </div>
                    {test.testPath && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(test.testPath!.replace('*', '1'))}
                      >
                        Go to Page
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manual Test Instructions */}
          <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
            <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">
              Manual Testing Instructions:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
              <li>Switch to each role using the buttons above</li>
              <li>Click "Go to Page" for each test to navigate to the relevant page</li>
              <li>Verify that the UI elements match the expected behavior</li>
              <li>Document any discrepancies or edge cases</li>
              <li>Test creating, editing, and deleting shows/trials as appropriate</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}