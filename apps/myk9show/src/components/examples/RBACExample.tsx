import React from 'react';
import { PermissionGuard } from '../auth/PermissionGuard';
import { useRegistrationPermissions } from '../../hooks/useRegistrationPermissions';
import { useRegistrationContext } from '@/hooks/useRegistrationContext';
import { PERMISSIONS, UserRole, ScopeType } from '../../types/auth-types';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

/**
 * Example component demonstrating RBAC usage patterns
 */
export function RBACExample() {
  const {
    user,
    roles,
    permissions,
    canViewAllDogs,
    canRegisterAnyDog,
    canCreateExhibitor,
    canBulkOperations,
    getRegistrationMode,
    getMaxDogsPerRegistration,
    isExhibitor,
    isSecretary,
    isClubAdmin,
    isSiteAdmin
  } = useRegistrationPermissions();

  const {
    workflowConfig,
    canViewAllDogs: contextCanViewAllDogs,
    setContextForShow
  } = useRegistrationContext();

  if (!user) {
    return <div>Please sign in to see RBAC examples</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">RBAC System Examples</h1>
      
      {/* User Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Current User Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong>Email:</strong> {user.email}
          </div>
          <div>
            <strong>Roles:</strong>{' '}
            {roles.map(role => (
              <Badge key={role} variant="secondary" className="mr-2">
                {role}
              </Badge>
            ))}
          </div>
          <div>
            <strong>Role Flags:</strong>
            <ul className="list-disc list-inside mt-2">
              <li>Exhibitor: {isExhibitor ? '✅' : '❌'}</li>
              <li>Secretary: {isSecretary ? '✅' : '❌'}</li>
              <li>Club Admin: {isClubAdmin ? '✅' : '❌'}</li>
              <li>Site Admin: {isSiteAdmin ? '✅' : '❌'}</li>
            </ul>
          </div>
          <div>
            <strong>Registration Mode:</strong> {getRegistrationMode()}
          </div>
          <div>
            <strong>Max Dogs Per Registration:</strong> {getMaxDogsPerRegistration()}
          </div>
        </CardContent>
      </Card>

      {/* Permission-Based UI Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Permission-Based UI Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Basic Permission Guard */}
          <div>
            <h3 className="font-semibold mb-2">Basic Permission Guards</h3>
            <div className="space-y-2">
              <PermissionGuard permission={PERMISSIONS.DOG_CREATE}>
                <Button variant="outline">Create Dog (dog:create)</Button>
              </PermissionGuard>
              
              <PermissionGuard permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}>
                <Button variant="outline">View All Dogs (registration:view_all_dogs)</Button>
              </PermissionGuard>
              
              <PermissionGuard 
                permission={PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR}
                fallback={<Badge variant="destructive">Cannot Create Exhibitors</Badge>}
              >
                <Button variant="outline">Create Exhibitor (registration:create_exhibitor)</Button>
              </PermissionGuard>
            </div>
          </div>

          {/* Role-Based Guards */}
          <div>
            <h3 className="font-semibold mb-2">Role-Based Guards</h3>
            <div className="space-y-2">
              <PermissionGuard role={UserRole.EXHIBITOR}>
                <Badge variant="default">Exhibitor Only Content</Badge>
              </PermissionGuard>
              
              <PermissionGuard 
                role={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
                fallback={<Badge variant="secondary">Secretary+ Required</Badge>}
              >
                <Badge variant="default">Secretary or Above Content</Badge>
              </PermissionGuard>
              
              <PermissionGuard 
                role={[UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
                fallback={<Badge variant="secondary">Club Admin+ Required</Badge>}
              >
                <Badge variant="default">Club Admin or Above Content</Badge>
              </PermissionGuard>
              
              <PermissionGuard 
                role={UserRole.SITE_ADMIN}
                fallback={<Badge variant="secondary">Site Admin Required</Badge>}
              >
                <Badge variant="default">Site Admin Only Content</Badge>
              </PermissionGuard>
            </div>
          </div>

          {/* Multiple Role Guards */}
          <div>
            <h3 className="font-semibold mb-2">Multiple Role Requirements</h3>
            <PermissionGuard role={[UserRole.SECRETARY, UserRole.CLUB_ADMIN]}>
              <Badge variant="default">Secretary OR Club Admin</Badge>
            </PermissionGuard>
            
            <PermissionGuard 
              role={[UserRole.SECRETARY, UserRole.CLUB_ADMIN]} 
              requireAll={true}
              fallback={<Badge variant="secondary">Need Secretary AND Club Admin</Badge>}
            >
              <Badge variant="default">Secretary AND Club Admin</Badge>
            </PermissionGuard>
          </div>

          {/* Scoped Permissions */}
          <div>
            <h3 className="font-semibold mb-2">Scoped Permissions</h3>
            <PermissionGuard 
              permission={PERMISSIONS.CLUB_EDIT_DETAILS}
              scope={{ type: ScopeType.CLUB, id: 'club-1' }}
              fallback={<Badge variant="secondary">No Club-1 Access</Badge>}
            >
              <Badge variant="default">Can Edit Club-1 Details</Badge>
            </PermissionGuard>
            
            <PermissionGuard 
              permission={PERMISSIONS.CLUB_EDIT_DETAILS}
              scope={{ type: ScopeType.CLUB, id: 'club-999' }}
              fallback={<Badge variant="secondary">No Club-999 Access</Badge>}
            >
              <Badge variant="default">Can Edit Club-999 Details</Badge>
            </PermissionGuard>
          </div>

          {/* Inverted Guards */}
          <div>
            <h3 className="font-semibold mb-2">Inverted Guards (NOT logic)</h3>
            <PermissionGuard permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS} not>
              <Badge variant="outline">Cannot View All Dogs (Regular User)</Badge>
            </PermissionGuard>
            
            <PermissionGuard role={UserRole.SITE_ADMIN} not>
              <Badge variant="outline">Not a Site Admin</Badge>
            </PermissionGuard>
          </div>

          {/* Custom Guards */}
          <div>
            <h3 className="font-semibold mb-2">Custom Permission Checks</h3>
            <PermissionGuard customCheck={() => roles.length > 1}>
              <Badge variant="default">Has Multiple Roles</Badge>
            </PermissionGuard>
            
            <PermissionGuard customCheck={() => permissions.length > 10}>
              <Badge variant="default">Has Many Permissions (10+)</Badge>
            </PermissionGuard>
          </div>
        </CardContent>
      </Card>

      {/* Registration Workflow Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Registration Workflow Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong>Workflow Steps:</strong>
            <ul className="list-disc list-inside mt-2">
              {workflowConfig.steps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
          
          <div>
            <strong>Feature Capabilities:</strong>
            <ul className="list-disc list-inside mt-2">
              <li>Bulk Selection: {workflowConfig.features.bulkSelection ? '✅' : '❌'}</li>
              <li>Create New: {workflowConfig.features.createNew ? '✅' : '❌'}</li>
              <li>Advanced Search: {workflowConfig.features.advancedSearch ? '✅' : '❌'}</li>
              <li>Handler Assignment: {workflowConfig.features.handlerAssignment ? '✅' : '❌'}</li>
              <li>Status Management: {workflowConfig.features.statusManagement ? '✅' : '❌'}</li>
              <li>Payment Override: {workflowConfig.features.paymentOverride ? '✅' : '❌'}</li>
            </ul>
          </div>
          
          <div>
            <strong>UI Configuration:</strong>
            <ul className="list-disc list-inside mt-2">
              <li>Show Advanced Options: {workflowConfig.ui.showAdvancedOptions ? '✅' : '❌'}</li>
              <li>Show Bulk Actions: {workflowConfig.ui.showBulkActions ? '✅' : '❌'}</li>
              <li>Show Quick Filters: {workflowConfig.ui.showQuickFilters ? '✅' : '❌'}</li>
              <li>Max Dogs Per Registration: {workflowConfig.ui.maxDogsPerRegistration}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Permission Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Permission Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <strong>Registration Permissions:</strong>
              <ul className="list-disc list-inside mt-2 text-sm">
                <li>View All Dogs: {canViewAllDogs ? '✅' : '❌'}</li>
                <li>Register Any Dog: {canRegisterAnyDog ? '✅' : '❌'}</li>
                <li>Create Exhibitor: {canCreateExhibitor ? '✅' : '❌'}</li>
                <li>Bulk Operations: {canBulkOperations ? '✅' : '❌'}</li>
              </ul>
            </div>
            <div>
              <strong>Context Permissions:</strong>
              <ul className="list-disc list-inside mt-2 text-sm">
                <li>Context View All Dogs: {contextCanViewAllDogs ? '✅' : '❌'}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Development Tools */}
      <Card>
        <CardHeader>
          <CardTitle>Development Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong>Test Different User Roles:</strong>
            <div className="flex gap-2 mt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload as Current User
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Change your email to one of: exhibitor@example.com, secretary@example.com, 
              clubadmin@example.com, admin@example.com to test different roles.
            </p>
          </div>
          
          <div>
            <strong>Set Registration Context:</strong>
            <div className="flex gap-2 mt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setContextForShow('show-123', 'club-1')}
              >
                Set Context for Show-123 / Club-1
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}