/**
 * RBAC Test Page
 * Phase 2.7: Testing database operations and functionality
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRBAC, useIsAdmin } from '@/hooks/useRBAC';
// usePermission not used
import {
  PermissionGuard,
  IfPermission,
  IfAdmin,
  PermissionDebugger,
} from '@/components/rbac/PermissionGuard';
import { rbacService } from '@/services/rbac/RBACService';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Database,
  Shield,
  Settings,
  TestTube,
} from 'lucide-react';

export const RBACTestPage: React.FC = () => {
  const {
    userRoles,
    userPermissions,
    effectivePermissions,
    isLoading,
    error,
    hasPermission,
    checkPermission,
    refresh,
  } = useRBAC();

  const { isAdmin } = useIsAdmin();
  const [testResults, setTestResults] = useState<
    Array<{
      test: string;
      result: boolean;
      details?: string;
    }>
  >([]);

  const [isRunningTests, setIsRunningTests] = useState(false);
  const [permissionToTest, setPermissionToTest] = useState('show:create');
  const [roleToAssign, setRoleToAssign] = useState('secretary');
  const [testUserId, setTestUserId] = useState('');

  // Database connectivity test
  const [dbStatus, setDbStatus] = useState<'testing' | 'connected' | 'error'>('testing');
  const [dbError, setDbError] = useState<string | null>(null);

  // Declare testDatabaseConnection before the useEffect that uses it
  const testDatabaseConnection = useCallback(async () => {
    try {
      setDbStatus('testing');
      setDbError(null);

      // Test basic database connectivity
      await rbacService.getAllRoles();
      await rbacService.getAllPermissions();

      setDbStatus('connected');
    } catch (error) {
      logger.error('Database connection test failed:', 'pages', {}, error as Error);
      setDbStatus('error');
      setDbError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      testDatabaseConnection();
    });
  }, [testDatabaseConnection]);

  const runPermissionTests = async () => {
    setIsRunningTests(true);
    const results: Array<{ test: string; result: boolean; details?: string }> = [];

    try {
      // Test 1: Basic permission check
      const hasShowCreate = hasPermission('show:create');
      results.push({
        test: 'Synchronous permission check (show:create)',
        result: hasShowCreate,
        details: hasShowCreate ? 'Permission granted' : 'Permission denied',
      });

      // Test 2: Async permission check
      const hasShowCreateAsync = await checkPermission('show:create');
      results.push({
        test: 'Asynchronous permission check (show:create)',
        result: hasShowCreateAsync,
        details: hasShowCreateAsync ? 'Permission granted' : 'Permission denied',
      });

      // Test 3: Admin permission check
      const hasAdminManage = hasPermission('admin:manage');
      results.push({
        test: 'Admin permission check (admin:manage)',
        result: hasAdminManage,
        details: hasAdminManage ? 'Is admin' : 'Not admin',
      });

      // Test 4: Role checking
      const hasSecretaryRole = userRoles.some(ur => ur.role?.name === 'secretary' && ur.is_active);
      results.push({
        test: 'Role checking (secretary)',
        result: hasSecretaryRole,
        details: hasSecretaryRole ? 'Has secretary role' : 'No secretary role',
      });

      // Test 5: Permission inheritance
      const hasShowManage = hasPermission('show:manage');
      const hasShowCRUD =
        hasPermission('show:create') &&
        hasPermission('show:read') &&
        hasPermission('show:update') &&
        hasPermission('show:delete');
      results.push({
        test: 'Permission inheritance (show:manage → CRUD)',
        result: hasShowManage || hasShowCRUD,
        details: hasShowManage
          ? 'Has manage permission'
          : hasShowCRUD
            ? 'Has individual CRUD permissions'
            : 'No show permissions',
      });

      // Test 6: Custom permission test
      if (permissionToTest) {
        const hasCustomPermission = await checkPermission(permissionToTest);
        results.push({
          test: `Custom permission test (${permissionToTest})`,
          result: hasCustomPermission,
          details: hasCustomPermission ? 'Permission granted' : 'Permission denied',
        });
      }
    } catch (error) {
      results.push({
        test: 'Error during testing',
        result: false,
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    setTestResults(results);
    setIsRunningTests(false);
  };

  const testRoleAssignment = async () => {
    if (!isAdmin || !testUserId || !roleToAssign) {
      notifications.warning('Need admin permissions and valid user ID and role');
      return;
    }

    try {
      await rbacService.assignRole({
        userId: testUserId,
        roleName: roleToAssign,
      });

      notifications.success(`Successfully assigned ${roleToAssign} role to user ${testUserId}`);
      await refresh();
    } catch (error) {
      notifications.error(
        `Role assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Loading RBAC data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pt-8 px-6 pb-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TestTube className="h-8 w-8" />
            RBAC System Test Page
          </h1>
          <p className="text-muted-foreground mt-2">
            Test and verify the database-driven Role-Based Access Control system
          </p>
        </div>

        {/* Database Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {dbStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
              {dbStatus === 'connected' && <CheckCircle className="h-4 w-4 text-green-600" />}
              {dbStatus === 'error' && <XCircle className="h-4 w-4 text-red-600" />}

              <span
                className={`font-medium ${
                  dbStatus === 'connected'
                    ? 'text-green-600'
                    : dbStatus === 'error'
                      ? 'text-red-600'
                      : 'text-yellow-600'
                }`}
              >
                {dbStatus === 'testing' && 'Testing connection...'}
                {dbStatus === 'connected' && 'Connected to RBAC database'}
                {dbStatus === 'error' && 'Database connection failed'}
              </span>
            </div>

            {dbError && (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{dbError}</AlertDescription>
              </Alert>
            )}

            <Button onClick={testDatabaseConnection} variant="outline" size="sm" className="mt-2">
              Retry Connection
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="permissions">Permission Tests</TabsTrigger>
            <TabsTrigger value="roles">Role Management</TabsTrigger>
            <TabsTrigger value="guards">UI Guards</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Current Roles</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {userRoles.length > 0 ? (
                      userRoles.map(ur => (
                        <Badge key={ur.id} variant={ur.is_active ? 'default' : 'secondary'}>
                          {ur.role?.display_name || ur.role?.name}
                          {ur.scope_type && ` (${ur.scope_type})`}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No roles assigned</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Permission Count</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Direct Permissions:</span>
                      <span className="font-medium">{userPermissions.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Effective Permissions:</span>
                      <span className="font-medium">{effectivePermissions.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Admin Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 font-medium">Site Administrator</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600">Regular User</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Effective Permissions Preview</CardTitle>
                <CardDescription>
                  Showing first 20 effective permissions (with inheritance)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {effectivePermissions.slice(0, 20).map((permission, index) => (
                    <Badge key={`${permission}-${index}`} variant="outline" className="text-xs">
                      {permission}
                    </Badge>
                  ))}
                  {effectivePermissions.length > 20 && (
                    <Badge variant="secondary" className="text-xs">
                      +{effectivePermissions.length - 20} more
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permission Tests Tab */}
          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Permission Testing</CardTitle>
                <CardDescription>Test various permission checking scenarios</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label htmlFor="permission-test">Permission to Test</Label>
                    <Input
                      id="permission-test"
                      value={permissionToTest}
                      onChange={e => setPermissionToTest(e.target.value)}
                      placeholder="e.g., show:create, admin:manage"
                    />
                  </div>
                  <Button onClick={runPermissionTests} disabled={isRunningTests}>
                    {isRunningTests && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Run Tests
                  </Button>
                </div>

                {testResults.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-medium">Test Results</h3>
                    {testResults.map((result, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded">
                        {result.result ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="flex-1">{result.test}</span>
                        {result.details && (
                          <span className="text-sm text-muted-foreground">{result.details}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Role Management Tab */}
          <TabsContent value="roles" className="space-y-4">
            <IfAdmin
              fallback={
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Admin permissions required to test role management features.
                  </AlertDescription>
                </Alert>
              }
            >
              <Card>
                <CardHeader>
                  <CardTitle>Role Assignment Testing</CardTitle>
                  <CardDescription>Test role assignment functionality (Admin only)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="test-user-id">User ID</Label>
                      <Input
                        id="test-user-id"
                        value={testUserId}
                        onChange={e => setTestUserId(e.target.value)}
                        placeholder="Enter user UUID"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role-to-assign">Role to Assign</Label>
                      <Input
                        id="role-to-assign"
                        value={roleToAssign}
                        onChange={e => setRoleToAssign(e.target.value)}
                        placeholder="e.g., secretary, judge"
                      />
                    </div>
                  </div>
                  <Button onClick={testRoleAssignment}>Assign Role</Button>
                </CardContent>
              </Card>
            </IfAdmin>
          </TabsContent>

          {/* UI Guards Tab */}
          <TabsContent value="guards" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Permission Guard Testing</CardTitle>
                <CardDescription>
                  Test UI permission guards and conditional rendering
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Permission Guard Examples */}
                <div className="space-y-2">
                  <h3 className="font-medium">PermissionGuard Examples</h3>

                  <PermissionGuard permission="show:create">
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        You can see this because you have 'show:create' permission
                      </AlertDescription>
                    </Alert>
                  </PermissionGuard>

                  <PermissionGuard permission="admin:manage">
                    <Alert>
                      <Settings className="h-4 w-4" />
                      <AlertDescription>
                        You can see this because you have 'admin:manage' permission
                      </AlertDescription>
                    </Alert>
                  </PermissionGuard>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Negative test — a guard checking a permission that doesn't exist. The red "You
                      don't have permission" message below is the expected, passing result (even for
                      site admins). If you see a message saying "You should NOT see this", the guard
                      is leaking access.
                    </p>
                    <PermissionGuard permission="nonexistent:permission">
                      <Alert variant="destructive">
                        <AlertDescription>You should NOT see this message</AlertDescription>
                      </Alert>
                    </PermissionGuard>
                  </div>
                </div>

                {/* Inline Permission Checks */}
                <div className="space-y-2">
                  <h3 className="font-medium">Inline Permission Checks</h3>

                  <IfPermission permission="show:create">
                    <Badge>You have show:create permission</Badge>
                  </IfPermission>

                  <IfAdmin>
                    <Badge variant="destructive">You are an admin</Badge>
                  </IfAdmin>

                  <IfPermission permission="judge:assign">
                    <Badge variant="secondary">You can assign judges</Badge>
                  </IfPermission>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Debug Info */}
        <PermissionDebugger />
      </div>
    </div>
  );
};
