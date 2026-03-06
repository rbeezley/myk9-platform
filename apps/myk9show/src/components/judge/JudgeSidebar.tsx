/**
 * Judge Sidebar Navigation Component
 *
 * Minimal navigation for judge dashboard pages.
 * INTENT: "Invisible technology" — judges want to glance and go, not navigate a tree.
 * Supports collapsed icon-rail mode via isCollapsed prop.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Scale, ClipboardCheck, Calendar, Users, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface JudgeSidebarProps {
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const navigationGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        title: 'Dashboard',
        href: '/judge/dashboard',
        icon: LayoutDashboard,
        description: "Today's assignments",
      },
    ],
  },
  {
    title: 'Scoring',
    items: [
      {
        title: 'Check-In',
        href: '/judge/check-in',
        icon: ClipboardCheck,
        description: 'Class check-in management',
      },
    ],
  },
  {
    title: 'Browse',
    items: [
      {
        title: 'Shows',
        href: '/judge/shows',
        icon: Calendar,
        description: 'Browse shows',
      },
      {
        title: 'People',
        href: '/judge/people',
        icon: Users,
        description: 'Browse people',
      },
    ],
  },
];

const ALL_NAV_HREFS = navigationGroups.flatMap(group => group.items.map(item => item.href));

export const JudgeSidebar: React.FC<JudgeSidebarProps> = ({ onCloseMobile, isCollapsed }) => {
  const location = useLocation();

  const isActivePath = (href: string) => {
    if (location.pathname === href) {
      return true;
    }

    const hasMoreSpecificRoute = ALL_NAV_HREFS.some(
      otherHref =>
        otherHref !== href &&
        otherHref.startsWith(href + '/') &&
        location.pathname.startsWith(otherHref)
    );

    if (hasMoreSpecificRoute) {
      return false;
    }

    if (href === '/judge/dashboard') {
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
            <Scale className="h-4 w-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-base font-semibold" style={{ fontWeight: 590 }}>
                Judge Console
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
            <Scale className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium" style={{ fontWeight: 500 }}>
                Judge Access
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Scoring and evaluation privileges</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JudgeSidebar;
