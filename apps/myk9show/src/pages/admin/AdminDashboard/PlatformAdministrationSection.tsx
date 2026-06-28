/**
 * PlatformAdministrationSection Component
 *
 * Section displaying admin cards for user management, system health, and configuration.
 * Color is intentionally neutral: these cards are navigation, not status, so they route
 * through the accent/muted tokens rather than decorative palette colors (DESIGN.md —
 * "Status Is Sacred": status hues are reserved for real status, never decoration).
 */

import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Settings, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PlatformAdministrationSectionProps } from './admin-dashboard-types';

interface AdminCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { content: string | number; variant: 'default' | 'secondary' | 'outline' };
  href: string;
}

function AdminCard({ title, description, icon: Icon, badge, href }: AdminCardProps) {
  return (
    <Link
      to={href}
      className="group relative block rounded-2xl border border-border bg-card p-6 shadow-sm
                 transition-colors duration-200 hover:border-primary/40 hover:bg-accent/40
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="rounded-xl bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        {badge && (
          <Badge variant={badge.variant} className="text-xs font-semibold">
            {badge.content}
          </Badge>
        )}
      </div>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <p className="mb-4 text-sm font-medium text-muted-foreground">{description}</p>
      <div className="flex items-center gap-1 text-sm font-medium text-primary">
        <span>Open</span>
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function PlatformAdministrationSection({ userCount }: PlatformAdministrationSectionProps) {
  return (
    <div className="mb-16">
      <div className="mb-8 flex items-center gap-4">
        <div className="rounded-xl bg-primary/10 p-3">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold leading-tight">Platform Administration</h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            System administration and user management overview
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <AdminCard
          title="User Management"
          description="Manage platform users, roles, and permissions"
          icon={Users}
          badge={{ content: userCount, variant: 'default' }}
          href="/admin/users"
        />
        <AdminCard
          title="Alerts & Monitoring"
          description="View system alerts and notifications"
          icon={Activity}
          href="/admin/alerts"
        />
        <AdminCard
          title="Roles & Permissions"
          description="Manage roles, permissions, and access control"
          icon={Settings}
          href="/admin/permissions"
        />
      </div>
    </div>
  );
}
