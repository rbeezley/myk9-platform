import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { logger } from '@/services/LoggingService';
import {
  Calendar, 
  Search, 
  Archive, 
  UserPlus, 
  Settings, 
  Gavel, 
  X,
  Plus,
  Trophy,
  MapPin,
  Users,
  FileText,
  AlertTriangle
} from 'lucide-react';
import type { UserWithRoles } from '@/types/auth-types';
import { UserRole } from '@/types/auth-types';
import { ShowPermissionValidator } from '@/utils/permissionValidation';

interface EmptyStateProps {
  tab: string;
  user: UserWithRoles | null;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onCreateShow?: () => void;
  onRegisterShow?: () => void;
  onFindShows?: () => void;
}

/**
 * Enhanced empty states with role-specific content and actions
 * Provides clear guidance for users on what to do next
 */
export const EnhancedEmptyState: React.FC<EmptyStateProps> = ({
  tab,
  user,
  hasActiveFilters = false,
  onClearFilters,
  onCreateShow,
  onFindShows
}) => {
  // Get empty state content based on tab and context
  const getEmptyStateContent = () => {
    if (hasActiveFilters) {
      return {
        icon: Search,
        title: 'No Shows Match Your Filters',
        description: 'Try adjusting your search criteria or clearing filters to see more shows.',
        actionLabel: 'Clear Filters',
        onAction: onClearFilters,
        actionIcon: X,
        variant: 'outline' as const,
        secondaryAction: {
          label: 'Browse All Shows',
          onClick: onFindShows,
          icon: Calendar
        }
      };
    }

    switch (tab) {
      case 'all': {
        const canCreateShowsAll = ShowPermissionValidator.canCreate(user);
        return {
          icon: Calendar,
          title: 'No Shows Available',
          description: user 
            ? 'There are currently no shows scheduled. Check back later or create a new show if you\'re an organizer.'
            : 'There are currently no shows scheduled. Check back later for upcoming events.',
          actionLabel: canCreateShowsAll ? 'Create Show' : 'Find Local Shows',
          onAction: canCreateShowsAll ? onCreateShow : onFindShows,
          actionIcon: canCreateShowsAll ? Plus : Search,
          variant: 'default' as const
        };
      }

      case 'past':
        return {
          icon: Archive,
          title: 'No Past Shows',
          description: 'You haven\'t participated in any completed shows yet. Register for upcoming shows to build your competition history.',
          actionLabel: 'Browse Upcoming Shows',
          onAction: onFindShows,
          actionIcon: Calendar,
          variant: 'default' as const
        };

      case 'entries':
        return {
          icon: UserPlus,
          title: 'No Show Entries',
          description: 'You haven\'t entered any shows yet. Browse available shows and register to start competing.',
          actionLabel: 'Find Shows to Enter',
          onAction: onFindShows,
          actionIcon: Search,
          variant: 'default' as const,
          secondaryAction: {
            label: 'Learn About Registration',
            onClick: () => logger.debug('Open registration help', 'shows'),
            icon: FileText
          }
        };

      case 'managing': {
        const isAdmin = user?.roles?.includes(UserRole.SITE_ADMIN);
        const canCreateShowsManaging = ShowPermissionValidator.canCreate(user);
        
        return {
          icon: isAdmin ? Settings : Gavel,
          title: isAdmin ? 'No Shows to Manage' : 'No Shows You\'re Managing',
          description: isAdmin 
            ? 'No shows have been created in the system yet. Create the first show to get started.'
            : 'You\'re not currently assigned as secretary for any shows. Contact show organizers or create a new show.',
          actionLabel: canCreateShowsManaging ? 'Create New Show' : 'View All Shows',
          onAction: canCreateShowsManaging ? onCreateShow : onFindShows,
          actionIcon: canCreateShowsManaging ? Plus : Calendar,
          variant: 'default' as const,
          secondaryAction: canCreateShowsManaging && !isAdmin ? {
            label: 'View All Shows',
            onClick: onFindShows,
            icon: Calendar
          } : undefined
        };
      }

      case 'assignments':
        return {
          icon: Gavel,
          title: 'No Judging Assignments',
          description: 'You don\'t have any current judging assignments. Your assignments will appear here when show organizers assign you to judge.',
          actionLabel: 'View Available Shows',
          onAction: onFindShows,
          actionIcon: Calendar,
          variant: 'default' as const,
          secondaryAction: {
            label: 'Update Judge Profile',
            onClick: () => logger.debug('Open judge profile', 'shows'),
            icon: Users
          }
        };

      default:
        return {
          icon: Calendar,
          title: 'No Shows Found',
          description: 'No shows are available for this category at the moment.',
          actionLabel: 'Browse All Shows',
          onAction: onFindShows,
          actionIcon: Search,
          variant: 'outline' as const
        };
    }
  };

  const content = getEmptyStateContent();
  const IconComponent = content.icon;
  const ActionIcon = content.actionIcon;

  return (
    <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
      <CardContent className="p-12 text-center">
        <div className={`${hasActiveFilters ? 'bg-warning-orange/10' : 'bg-muted/50'} rounded-full p-6 mb-6 inline-block`}>
          <IconComponent className={`h-12 w-12 ${hasActiveFilters ? 'text-warning-orange' : 'text-muted-foreground'}`} />
        </div>
        
        <h3 className="text-xl font-semibold mb-3 tracking-tight">
          {content.title}
        </h3>
        
        <p className="text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
          {content.description}
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {content.onAction && (
            <Button 
              onClick={() => {
                // Audit button click
                ShowPermissionValidator.auditAction(
                  'empty_state_action',
                  user,
                  'button',
                  content.actionLabel || 'unknown',
                  true
                );
                content.onAction?.();
              }} 
              variant={content.variant}
              size="lg"
              className="min-w-[160px]"
            >
              {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
              {content.actionLabel}
            </Button>
          )}
          
          {content.secondaryAction && (
            <Button 
              onClick={() => {
                // Audit secondary button click
                ShowPermissionValidator.auditAction(
                  'empty_state_secondary_action',
                  user,
                  'button',
                  content.secondaryAction!.label,
                  true
                );
                content.secondaryAction?.onClick?.();
              }} 
              variant="outline"
              size="lg"
              className="min-w-[160px]"
            >
              <content.secondaryAction.icon className="h-4 w-4 mr-2" />
              {content.secondaryAction.label}
            </Button>
          )}
        </div>
        
        {/* Additional helpful information for specific tabs */}
        {tab === 'entries' && (
          <div className="mt-8 p-4 bg-primary/5 rounded-lg border border-primary/10">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <h4 className="font-medium text-primary mb-1">New to Competition?</h4>
                <p className="text-sm text-muted-foreground">
                  Browse shows by location and discipline to find events that match your interests and experience level.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {tab === 'managing' && user?.roles?.includes(UserRole.SECRETARY) && (
          <div className="mt-8 p-4 bg-success-green/5 rounded-lg border border-success-green/10">
            <div className="flex items-start gap-3">
              <Trophy className="h-5 w-5 text-success-green mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <h4 className="font-medium text-success-green mb-1">Show Secretary Tools</h4>
                <p className="text-sm text-muted-foreground">
                  As a secretary, you can create shows, manage entries, and coordinate with judges and exhibitors.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {hasActiveFilters && (
          <div className="mt-8 p-4 bg-warning-orange/5 rounded-lg border border-warning-orange/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-orange mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <h4 className="font-medium text-warning-orange mb-1">Active Filters</h4>
                <p className="text-sm text-muted-foreground">
                  Your current search filters may be too restrictive. Try broadening your criteria to see more results.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Quick empty state for loading/switching contexts
 */
export const QuickEmptyState: React.FC<{ message?: string }> = ({ 
  message = "Loading shows..." 
}) => (
  <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
    <CardContent className="p-8 text-center">
      <div className="bg-muted/50 rounded-full p-4 mb-4 inline-block animate-pulse">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground">{message}</p>
    </CardContent>
  </Card>
);

export default EnhancedEmptyState;