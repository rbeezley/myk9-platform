/**
 * Exhibitor Sidebar Navigation Component
 * 
 * Provides organized navigation for exhibitor dashboard pages
 * Features grouped navigation with Premium design
 * Based on the Admin sidebar pattern
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  History,
  Search,
  Calendar,
  Heart,
  X,
  User
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface ExhibitorSidebarProps {
  onCloseMobile?: () => void;
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
        href: '/exhibitor/dashboard',
        icon: LayoutDashboard,
        description: 'Overview and quick actions'
      },
      {
        title: 'My Account',
        href: '/exhibitor/account',
        icon: User,
        description: 'Profile and preferences'
      }
    ]
  },
  {
    title: 'My Entries',
    items: [
      {
        title: 'Current Entries',
        href: '/exhibitor/entries',
        icon: FileText,
        description: 'Active show entries'
      },
      {
        title: 'Entry History',
        href: '/exhibitor/entries/history',
        icon: History,
        description: 'Past entries and records'
      },
    ]
  },
  {
    title: 'Show Discovery',
    items: [
      {
        title: 'Browse Shows',
        href: '/shows',
        icon: Search,
        description: 'Find and explore shows'
      },
      {
        title: 'Event Calendar',
        href: '/calendar',
        icon: Calendar,
        description: 'Show calendar and schedules'
      },
    ]
  },
  {
    title: 'My Dogs',
    items: [
      {
        title: 'Dog Profiles',
        href: '/dogs',
        icon: Heart,
        description: 'Manage your dogs'
      },
    ]
  },
];

export const ExhibitorSidebar: React.FC<ExhibitorSidebarProps> = ({ onCloseMobile }) => {
  const location = useLocation();

  const isActivePath = (href: string) => {
    // For exact route matching
    if (location.pathname === href) {
      return true;
    }
    
    // Special handling for routes with sub-routes
    // Don't mark parent routes as active if a more specific child route exists
    const allHrefs = navigationGroups.flatMap(group => group.items.map(item => item.href));
    const hasMoreSpecificRoute = allHrefs.some(otherHref => 
      otherHref !== href && 
      otherHref.startsWith(href + '/') && 
      location.pathname.startsWith(otherHref)
    );
    
    if (hasMoreSpecificRoute) {
      return false;
    }
    
    // For other routes, use startsWith logic (but avoid false positives)
    if (href === '/exhibitor/dashboard') {
      return location.pathname === href;
    }
    
    return location.pathname.startsWith(href + '/') || location.pathname === href;
  };

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary shadow-sm">
            <Heart className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ fontWeight: 590 }}>
              Exhibitor Console
            </h2>
          </div>
        </div>
        
        {/* Mobile close button */}
        {onCloseMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCloseMobile}
            className="md:hidden"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <nav className="space-y-8">
          {navigationGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              <h3 className="mb-3 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = isActivePath(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={onCloseMobile}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                        isActive
                          ? "bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-2 border-primary"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isActive 
                            ? "text-primary" 
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "font-medium transition-colors",
                          isActive ? "text-primary" : ""
                        )} style={{ fontWeight: isActive ? 500 : 400 }}>
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                            {item.description}
                          </div>
                        )}
                      </div>
                      {item.badge && (
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
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium" style={{ fontWeight: 500 }}>
              Exhibitor Access
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Show entry and dog management privileges
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExhibitorSidebar;