/**
 * Bulk Permission Operations Component
 * Phase 4.7: Advanced bulk operations UI
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Package, 
  Users, 
  Shield, 
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Info,
  Download,
  Upload,
  Copy,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { rbacService } from '@/services/rbac/RBACService';
import { Role, Permission, UserRole } from '@/types/rbac-types';

interface BulkOperation {
  id: string;
  type: 'assign_role' | 'revoke_role' | 'update_permissions' | 'copy_permissions' | 'export_data' | 'import_data';
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface BulkOperationProgress {
  operationId: string;
  operation: string; // Add operation field that was expected
  total: number;
  completed: number;
  failed: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  errors: string[];
}

interface BulkOperationConfig {
  selectedRoles?: string[];
  selectedUsers?: string[];
  selectedPermissions?: string[];
  permissionIds?: string[];
  sourceRoleId?: string;
  targetRoleIds?: string[];
  roleId?: string;
  userId?: string;
  expiresAt?: string;
  scopeType?: string;
  scopeId?: string;
}

interface BulkPermissionOperationsProps {
  selectedUsers?: string[];
  selectedRoles?: string[];
  onOperationComplete?: (result: BulkOperationProgress) => void;
}

const BULK_OPERATIONS: BulkOperation[] = [
  {
    id: 'assign_role',
    type: 'assign_role',
    name: 'Bulk Role Assignment',
    description: 'Assign roles to multiple users at once',
    icon: Users,
    color: 'bg-blue-100 text-blue-700 border-blue-200'
  },
  {
    id: 'revoke_role',
    type: 'revoke_role',
    name: 'Bulk Role Revocation',
    description: 'Remove roles from multiple users',
    icon: Trash2,
    color: 'bg-red-100 text-red-700 border-red-200'
  },
  {
    id: 'update_permissions',
    type: 'update_permissions',
    name: 'Bulk Permission Update',
    description: 'Update permissions for multiple roles',
    icon: Shield,
    color: 'bg-green-100 text-green-700 border-green-200'
  },
  {
    id: 'copy_permissions',
    type: 'copy_permissions',
    name: 'Copy Role Permissions',
    description: 'Copy permissions from one role to others',
    icon: Copy,
    color: 'bg-purple-100 text-purple-700 border-purple-200'
  },
  {
    id: 'export_data',
    type: 'export_data',
    name: 'Export Permissions',
    description: 'Export role and permission data',
    icon: Download,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200'
  },
  {
    id: 'import_data',
    type: 'import_data',
    name: 'Import Permissions',
    description: 'Import roles and permissions from file',
    icon: Upload,
    color: 'bg-orange-100 text-orange-700 border-orange-200'
  }
];

export const BulkPermissionOperations: React.FC<BulkPermissionOperationsProps> = ({
  selectedUsers = [],
  selectedRoles = [],
  onOperationComplete
}) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string>('');
  const [operationConfig, setOperationConfig] = useState<BulkOperationConfig>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [rolesData, permissionsData, userRolesData] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
        rbacService.getAllUserRoles()
      ]);

      setRoles(rolesData);
      setPermissions(permissionsData);
      setUserRoles(userRolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOperationSelect = (operationId: string) => {
    setSelectedOperation(operationId);
    setOperationConfig({});
    setProgress(null);
    setError(null);
  };

  const validateOperation = (): string | null => {
    const operation = BULK_OPERATIONS.find(op => op.id === selectedOperation);
    if (!operation) return 'No operation selected';

    switch (operation.type) {
      case 'assign_role':
        if (selectedUsers.length === 0) return 'No users selected';
        if (!operationConfig.roleId) return 'No role selected';
        break;
      case 'revoke_role':
        if (selectedUsers.length === 0) return 'No users selected';
        if (!operationConfig.roleId) return 'No role selected';
        break;
      case 'update_permissions':
        if (selectedRoles.length === 0) return 'No roles selected';
        if (!operationConfig.permissionIds?.length) return 'No permissions selected';
        break;
      case 'copy_permissions':
        if (!operationConfig.sourceRoleId) return 'No source role selected';
        if (!operationConfig.targetRoleIds?.length) return 'No target roles selected';
        break;
    }

    return null;
  };

  const executeOperation = async () => {
    const validationError = validateOperation();
    if (validationError) {
      setError(validationError);
      return;
    }

    const operation = BULK_OPERATIONS.find(op => op.id === selectedOperation);
    if (!operation) return;

    try {
      setIsLoading(true);
      setError(null);

      // Initialize progress tracking
      const operationProgress: BulkOperationProgress = {
        operationId: operation.id,
        operation: operation.name,
        total: getOperationItemCount(),
        completed: 0,
        failed: 0,
        status: 'running',
        errors: []
      };
      setProgress(operationProgress);

      // Execute operation based on type
      switch (operation.type) {
        case 'assign_role':
          await executeBulkRoleAssignment();
          break;
        case 'revoke_role':
          await executeBulkRoleRevocation();
          break;
        case 'update_permissions':
          await executeBulkPermissionUpdate();
          break;
        case 'copy_permissions':
          await executeBulkPermissionCopy();
          break;
        case 'export_data':
          await executeDataExport();
          break;
        case 'import_data':
          await executeDataImport();
          break;
      }

      setProgress(prev => prev ? { ...prev, status: 'completed' } : null);
      
      if (onOperationComplete && progress) {
        onOperationComplete({ ...progress, status: 'completed' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      setProgress(prev => prev ? { ...prev, status: 'failed' } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const getOperationItemCount = (): number => {
    const operation = BULK_OPERATIONS.find(op => op.id === selectedOperation);
    if (!operation) return 0;

    switch (operation.type) {
      case 'assign_role':
      case 'revoke_role':
        return selectedUsers.length;
      case 'update_permissions':
        return selectedRoles.length;
      case 'copy_permissions':
        return operationConfig.targetRoleIds?.length || 0;
      default:
        return 1;
    }
  };

  const executeBulkRoleAssignment = async () => {
    for (let i = 0; i < selectedUsers.length; i++) {
      try {
        await rbacService.assignRole({
          userId: selectedUsers[i],
          roleId: operationConfig.roleId,
          scopeType: operationConfig.scopeType,
          scopeId: operationConfig.scopeId,
          expiresAt: operationConfig.expiresAt
        });

        setProgress(prev => prev ? { ...prev, completed: prev.completed + 1 } : null);
      } catch (err) {
        setProgress(prev => prev ? { 
          ...prev, 
          failed: prev.failed + 1,
          errors: [...prev.errors, `Failed to assign role to user ${selectedUsers[i]}: ${err}`]
        } : null);
      }
    }
  };

  const executeBulkRoleRevocation = async () => {
    for (let i = 0; i < selectedUsers.length; i++) {
      try {
        const role = roles.find(r => r.id === operationConfig.roleId);
        if (role) {
          await rbacService.revokeRole({
            userId: selectedUsers[i],
            roleName: role.name,
            scopeType: operationConfig.scopeType,
            scopeId: operationConfig.scopeId
          });
        }

        setProgress(prev => prev ? { ...prev, completed: prev.completed + 1 } : null);
      } catch (err) {
        setProgress(prev => prev ? { 
          ...prev, 
          failed: prev.failed + 1,
          errors: [...prev.errors, `Failed to revoke role from user ${selectedUsers[i]}: ${err}`]
        } : null);
      }
    }
  };

  const executeBulkPermissionUpdate = async () => {
    for (let i = 0; i < selectedRoles.length; i++) {
      try {
        await rbacService.updateRolePermissions(selectedRoles[i], operationConfig.permissionIds);
        setProgress(prev => prev ? { ...prev, completed: prev.completed + 1 } : null);
      } catch (err) {
        setProgress(prev => prev ? { 
          ...prev, 
          failed: prev.failed + 1,
          errors: [...prev.errors, `Failed to update permissions for role ${selectedRoles[i]}: ${err}`]
        } : null);
      }
    }
  };

  const executeBulkPermissionCopy = async () => {
    try {
      // Get source role permissions
      const sourcePermissions = await rbacService.getRolePermissions(operationConfig.sourceRoleId);
      const permissionIds = sourcePermissions.map(rp => rp.permission_id);

      for (let i = 0; i < operationConfig.targetRoleIds.length; i++) {
        try {
          await rbacService.updateRolePermissions(operationConfig.targetRoleIds[i], permissionIds);
          setProgress(prev => prev ? { ...prev, completed: prev.completed + 1 } : null);
        } catch (err) {
          setProgress(prev => prev ? { 
            ...prev, 
            failed: prev.failed + 1,
            errors: [...prev.errors, `Failed to copy permissions to role ${operationConfig.targetRoleIds[i]}: ${err}`]
          } : null);
        }
      }
    } catch (err) {
      throw new Error(`Failed to get source role permissions: ${err}`);
    }
  };

  const executeDataExport = async () => {
    // Mock export functionality
    const exportData = {
      roles: roles,
      permissions: permissions,
      userRoles: userRoles,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `permission-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setProgress(prev => prev ? { ...prev, completed: 1 } : null);
  };

  const executeDataImport = async () => {
    // Mock import functionality - would need file upload component
    setProgress(prev => prev ? { ...prev, completed: 1 } : null);
  };

  const pauseOperation = () => {
    setProgress(prev => prev ? { ...prev, status: 'paused' } : null);
  };

  const resumeOperation = () => {
    setProgress(prev => prev ? { ...prev, status: 'running' } : null);
  };

  const getProgressPercentage = (): number => {
    if (!progress || progress.total === 0) return 0;
    return Math.round(((progress.completed + progress.failed) / progress.total) * 100);
  };

  const renderOperationConfig = () => {
    const operation = BULK_OPERATIONS.find(op => op.id === selectedOperation);
    if (!operation) return null;

    switch (operation.type) {
      case 'assign_role':
      case 'revoke_role':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Select Role</label>
              <Select value={operationConfig.roleId || ''} onValueChange={(value) => 
                setOperationConfig(prev => ({ ...prev, roleId: value }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              This will {operation.type === 'assign_role' ? 'assign' : 'revoke'} the selected role {operation.type === 'assign_role' ? 'to' : 'from'} {selectedUsers.length} users.
            </div>
          </div>
        );

      case 'update_permissions':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Select Permissions</label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {permissions.map(permission => (
                  <div key={permission.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={permission.id}
                      checked={operationConfig.permissionIds?.includes(permission.id) || false}
                      onCheckedChange={(checked) => {
                        const currentIds = operationConfig.permissionIds || [];
                        const newIds = checked 
                          ? [...currentIds, permission.id]
                          : currentIds.filter(id => id !== permission.id);
                        setOperationConfig(prev => ({ ...prev, permissionIds: newIds }));
                      }}
                    />
                    <label htmlFor={permission.id} className="text-sm">
                      {permission.display_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              This will update permissions for {selectedRoles.length} roles.
            </div>
          </div>
        );

      case 'copy_permissions':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Source Role</label>
              <Select value={operationConfig.sourceRoleId || ''} onValueChange={(value) => 
                setOperationConfig(prev => ({ ...prev, sourceRoleId: value }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Choose source role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Target Roles</label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {roles.filter(r => r.id !== operationConfig.sourceRoleId).map(role => (
                  <div key={role.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={role.id}
                      checked={operationConfig.targetRoleIds?.includes(role.id) || false}
                      onCheckedChange={(checked) => {
                        const currentIds = operationConfig.targetRoleIds || [];
                        const newIds = checked 
                          ? [...currentIds, role.id]
                          : currentIds.filter(id => id !== role.id);
                        setOperationConfig(prev => ({ ...prev, targetRoleIds: newIds }));
                      }}
                    />
                    <label htmlFor={role.id} className="text-sm">
                      {role.display_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-muted-foreground">
            No additional configuration required for this operation.
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bulk Permission Operations
          </CardTitle>
          <CardDescription>
            Execute operations on multiple users, roles, or permissions simultaneously
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Bulk operations can affect many users and roles at once. Always review your selections 
              and test operations in a non-production environment first.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Operation Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Operation</CardTitle>
          <CardDescription>
            Choose the type of bulk operation you want to perform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BULK_OPERATIONS.map((operation) => {
              const Icon = operation.icon;
              const isSelected = selectedOperation === operation.id;
              
              return (
                <Card 
                  key={operation.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? 'ring-2 ring-primary shadow-md' : ''
                  }`}
                  onClick={() => handleOperationSelect(operation.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${operation.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{operation.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {operation.description}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Operation Configuration */}
      {selectedOperation && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Operation</CardTitle>
            <CardDescription>
              Set up the parameters for your bulk operation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderOperationConfig()}
          </CardContent>
        </Card>
      )}

      {/* Progress Display */}
      {progress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className={`h-5 w-5 ${progress.status === 'running' ? 'animate-spin' : ''}`} />
              Operation Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {progress.completed + progress.failed} of {progress.total} items processed
              </span>
              <Badge variant={
                progress.status === 'completed' ? 'default' :
                progress.status === 'failed' ? 'destructive' :
                progress.status === 'paused' ? 'secondary' : 'outline'
              }>
                {progress.status}
              </Badge>
            </div>
            
            <Progress value={getProgressPercentage()} className="w-full" />
            
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-green-600 font-semibold">{progress.completed}</div>
                <div className="text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-red-600 font-semibold">{progress.failed}</div>
                <div className="text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">{progress.total - progress.completed - progress.failed}</div>
                <div className="text-muted-foreground">Remaining</div>
              </div>
            </div>

            {progress.status === 'running' && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={pauseOperation}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause Operation
                </Button>
              </div>
            )}

            {progress.status === 'paused' && (
              <div className="flex justify-center">
                <Button onClick={resumeOperation}>
                  <Play className="h-4 w-4 mr-2" />
                  Resume Operation
                </Button>
              </div>
            )}

            {progress.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-red-700">Errors ({progress.errors.length})</h4>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {progress.errors.map((error, index) => (
                    <div key={index} className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {selectedOperation && !progress && (
        <div className="flex justify-center">
          <Button
            onClick={executeOperation}
            disabled={isLoading || !!validateOperation()}
            className="px-8"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Execute Operation
          </Button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};