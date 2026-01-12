/**
 * Organization Permission Management Page
 * Phase 4.4: Organization-specific permission overrides
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
import { logger } from '@/services/LoggingService';
  ArrowLeft, 
  Building2, 
  Shield, 
  Info,
  AlertTriangle,
  Users,
  Settings
} from 'lucide-react';
import { OrganizationPermissionOverrides } from '@/components/admin/permissions/OrganizationPermissionOverrides';

// Mock data - in real implementation, this would come from a club/organization service
const mockOrganizations = [
  {
    id: 'org-1',
    name: 'Tulsa Dog Training Club',
    type: 'Club',
    memberCount: 45,
    activeShows: 3
  },
  {
    id: 'org-2', 
    name: 'Oklahoma Kennel Club',
    type: 'Club',
    memberCount: 72,
    activeShows: 1
  },
  {
    id: 'org-3',
    name: 'AKC Regional Office',
    type: 'Organization',
    memberCount: 12,
    activeShows: 0
  }
];

const OrganizationPermissionPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [organization, setOrganization] = useState<{ 
    id: string; 
    name: string;
    type?: string;
    memberCount?: number;
    activeShows?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganization = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Mock loading - in real implementation, fetch from API
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const orgData = mockOrganizations.find(org => org.id === organizationId);
      if (!orgData) {
        throw new Error('Organization not found');
      }
      
      setOrganization(orgData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organization');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadOrganization();
  }, [loadOrganization]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading organization...</span>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error || 'Organization not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/permissions">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Permission Management
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            {organization.name} Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage role permission overrides for this organization
          </p>
        </div>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Organization Information
          </CardTitle>
          <CardDescription>
            Overview of the organization and its current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="font-semibold">{organization.type || 'Unknown'}</div>
              <div className="text-sm text-muted-foreground">Organization Type</div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="font-semibold">{organization.memberCount || 0}</div>
              <div className="text-sm text-muted-foreground">Members</div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="font-semibold">{organization.activeShows || 0}</div>
              <div className="text-sm text-muted-foreground">Active Shows</div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="font-semibold">
                <Badge variant="outline">Active</Badge>
              </div>
              <div className="text-sm text-muted-foreground">Status</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permission Override Notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Organization Permission Overrides</strong> allow you to customize role permissions 
          specifically for this organization. These overrides only apply when users are operating 
          within this organization's context and will take precedence over global role permissions.
        </AlertDescription>
      </Alert>

      {/* Permission Overrides Component */}
      <OrganizationPermissionOverrides
        organizationId={organization.id}
        organizationName={organization.name}
        onOverrideChange={(overrides) => {
          logger.debug('Overrides changed:', 'admin', { data: overrides });
        }}
      />

      {/* Usage Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Override Guidelines</CardTitle>
          <CardDescription>
            Best practices for managing organization-specific permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-green-700 mb-2">✅ Do</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Use overrides to grant additional permissions for specific organizational needs</li>
                <li>• Document the business reason for each override</li>
                <li>• Review overrides regularly during access audits</li>
                <li>• Remove overrides when they're no longer needed</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-red-700 mb-2">❌ Don't</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Use overrides as a substitute for proper role design</li>
                <li>• Grant excessive permissions without justification</li>
                <li>• Leave overrides in place indefinitely without review</li>
                <li>• Override security-critical permissions without approval</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizationPermissionPage;