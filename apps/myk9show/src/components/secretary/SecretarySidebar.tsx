/**
 * Secretary Sidebar Navigation Component
 *
 * Provides organized navigation for secretary dashboard pages
 * Features grouped navigation with Premium design
 * Based on the Admin sidebar pattern
 * Supports collapsed icon-rail mode via isCollapsed prop
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Plus,
  FileText,
  List,
  Users,
  Heart,
  Building2,
  X,
  ClipboardList,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface SecretarySidebarProps {
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

interface NavGroup {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
}

const navigationGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        title: 'Dashboard',
        href: '/secretary/dashboard',
        icon: LayoutDashboard,
        description: 'Overview and quick actions',
      },
    ],
  },
  {
    title: 'Show Management',
    items: [
      {
        title: 'My Shows',
        href: '/secretary/shows',
        icon: Calendar,
        description: 'Shows you are managing',
      },
      {
        title: 'Create Show',
        href: '/secretary/create-show',
        icon: Plus,
        description: 'Start a new show',
      },
    ],
  },
  {
    title: 'Entry Management',
    items: [
      {
        title: 'Entries',
        href: '/secretary/entries',
        icon: FileText,
        description: 'Manage show entries',
      },
      {
        title: 'Run Orders',
        href: '/secretary/run-order',
        icon: List,
        description: 'Class scheduling and ordering',
      },
    ],
  },
  {
    title: 'Participants',
    items: [
      {
        title: 'People',
        href: '/secretary/users',
        icon: Users,
        description: 'Exhibitors and handlers',
      },
      {
        title: 'Dogs',
        href: '/secretary/dogs',
        icon: Heart,
        description: 'Registered dogs',
      },
      {
        title: 'Clubs',
        href: '/secretary/clubs',
        icon: Building2,
        description: 'Club management',
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        title: 'Calendar',
        href: '/secretary/calendar',
        icon: CalendarDays,
        description: 'Event scheduling',
      },
    ],
  },
];

// Pre-compute all hrefs once (used for active-path detection)
const ALL_NAV_HREFS = navigationGroups.flatMap(group => group.items.map(item => item.href));

export const SecretarySidebar: React.FC<SecretarySidebarProps> = ({
  onCloseMobile,
  isCollapsed,
}) => {
  const location = useLocation();

  const isActivePath = (href: string) => {
    // For exact route matching
    if (location.pathname === href) {
      return true;
    }

    // Special handling for routes with sub-routes
    // Don't mark parent routes as active if a more specific child route exists
    const hasMoreSpecificRoute = ALL_NAV_HREFS.some(
      otherHref =>
        otherHref !== href &&
        otherHref.startsWith(href + '/') &&
        location.pathname.startsWith(otherHref)
    );

    if (hasMoreSpecificRoute) {
      return false;
    }

    // For other routes, use startsWith logic (but avoid false positives)
    if (href === '/secretary/dashboard') {
      return location.pathname === href;
    }

    return location.pathname.startsWith(href + '/') || location.pathname === href;
  };

  return (
    <div className="flex h-full flex-col bg-card overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-border',
          isCollapsed ? 'justify-center px-0' : 'justify-between px-6'
        )}
      >
        <div className={cn('flex items-center', isCollapsed ? '' : 'gap-3')}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary shadow-sm">
            <ClipboardList className="h-4 w-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-base font-semibold" style={{ fontWeight: 590 }}>
                Secretary Console
              </h2>
            </div>
          )}
        </div>
        {!isCollapsed && onCloseMobile && (
          <Button variant="ghost" size="sm" onClick={onCloseMobile} className="md:hidden">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className={cn('flex-1 overflow-y-auto py-6', isCollapsed ? 'px-2' : 'px-4')}>
        <nav className={cn(isCollapsed ? 'space-y-4' : 'space-y-8')}>
          {navigationGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {!isCollapsed && (
                <h3 className="mb-3 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.title}
                </h3>
              )}
              <div className="space-y-1">
                {group.items.map(item => {
                  const isActive = isActivePath(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={onCloseMobile}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg text-sm transition-all duration-200',
                        isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                        isActive
                          ? 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'transition-colors flex-shrink-0',
                          isCollapsed ? 'h-5 w-5' : 'h-4 w-4',
                          isActive
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-foreground'
                        )}
                      />
                      {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              'font-medium transition-colors',
                              isActive ? 'text-primary' : ''
                            )}
                            style={{ fontWeight: isActive ? 500 : 400 }}
                          >
                            {item.title}
                          </div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {item.description}
                            </div>
                          )}
                        </div>
                      )}
                      {!isCollapsed && item.badge && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4">
        {isCollapsed ? (
          <div className="flex justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium" style={{ fontWeight: 500 }}>
                Secretary Access
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Show management and coordination privileges
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecretarySidebar;
