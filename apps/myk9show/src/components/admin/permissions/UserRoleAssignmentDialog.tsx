/**
 * User Role Assignment Dialog
 * Phase 3.4: Dialog for assigning roles to users with scoping options
 * Created: December 2024
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, AlertTriangle, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { Role } from '@/types/rbac-types';

interface UserRoleAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (assignment: {
    userId: string;
    roleId: string;
    scopeType?: string | undefined;
    scopeId?: string | undefined;
    expiresAt?: string | undefined;
  }) => Promise<void>;
  roles: Role[];
}

export const UserRoleAssignmentDialog: React.FC<UserRoleAssignmentDialogProps> = ({
  open,
  onOpenChange,
  onAssign,
  roles
}) => {
  const [formData, setFormData] = useState({
    userId: '',
    userEmail: '',
    roleId: '',
    scopeType: '',
    scopeId: '',
  });
  const [expirationDate, setExpirationDate] = useState<Date | undefined>();
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setFormData({
      userId: '',
      userEmail: '',
      roleId: '',
      scopeType: '',
      scopeId: '',
    });
    setExpirationDate(undefined);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.userId || !formData.roleId) {
      setError('User ID and Role are required');
      return;
    }

    try {
      setIsAssigning(true);
      setError(null);

      const assignment = {
        userId: formData.userId,
        roleId: formData.roleId,
        scopeType: formData.scopeType || undefined,
        scopeId: formData.scopeId || undefined,
        expiresAt: expirationDate?.toISOString() || undefined,
      };

      await onAssign(assignment);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const scopeTypes = [
    { value: '', label: 'Global (No Scope)' },
    { value: 'club', label: 'Club Specific' },
    { value: 'show', label: 'Show Specific' },
  ];

  const selectedRole = roles.find(r => r.id === formData.roleId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign Role to User
          </DialogTitle>
          <DialogDescription>
            Assign a role to a user with optional scope and expiration settings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* User Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-id">User ID *</Label>
              <Input
                id="user-id"
                value={formData.userId}
                onChange={(e) => setFormData(prev => ({ ...prev, userId: e.target.value }))}
                placeholder="Enter user UUID"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                The unique identifier for the user in the system
              </p>
            </div>

            <div>
              <Label htmlFor="user-email">User Email (Optional)</Label>
              <Input
                id="user-email"
                type="email"
                value={formData.userEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, userEmail: e.target.value }))}
                placeholder="user@example.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                For reference only, not used for assignment
              </p>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <Label htmlFor="role">Role *</Label>
            <Select 
              value={formData.roleId} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, roleId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    <div className="flex items-center gap-2">
                      <span>{role.display_name}</span>
                      {role.is_system && (
                        <span className="text-xs bg-muted px-1 py-0.5 rounded">System</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole?.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedRole.description}
              </p>
            )}
          </div>

          {/* Scope Settings */}
          <div className="space-y-3">
            <Label>Scope (Optional)</Label>
            
            <div>
              <Label htmlFor="scope-type" className="text-sm">Scope Type</Label>
              <Select 
                value={formData.scopeType} 
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  scopeType: value,
                  scopeId: '' // Clear scope ID when type changes
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.scopeType && (
              <div>
                <Label htmlFor="scope-id" className="text-sm">Scope ID</Label>
                <Input
                  id="scope-id"
                  value={formData.scopeId}
                  onChange={(e) => setFormData(prev => ({ ...prev, scopeId: e.target.value }))}
                  placeholder={`Enter ${formData.scopeType} ID`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The ID of the {formData.scopeType} this role assignment applies to
                </p>
              </div>
            )}
          </div>

          {/* Expiration Date */}
          <div>
            <Label>Expiration Date (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expirationDate ? (
                    format(expirationDate, "PPP")
                  ) : (
                    <span>Pick an expiration date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={expirationDate}
                  onSelect={setExpirationDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty for permanent assignment
            </p>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => handleOpenChange(false)}
              disabled={isAssigning}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isAssigning}>
              {isAssigning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Assigning...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Role
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};