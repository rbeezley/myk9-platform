/**
 * PlatformAdministrationSection Component
 *
 * Section displaying admin cards for user management, system health, and configuration.
 */

import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Settings, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PlatformAdministrationSectionProps } from './admin-dashboard-types';

const APPLE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

interface AdminCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBgFrom: string;
  iconBgTo: string;
  badgeContent: string | number;
  badgeVariant: 'default' | 'secondary' | 'outline';
  badgeClassName?: string;
  buttonText: string;
  buttonClassName: string;
  hoverColor: string;
  href: string;
}

function AdminCard({
  title,
  description,
  icon: Icon,
  iconColor,
  iconBgFrom,
  iconBgTo,
  badgeContent,
  badgeVariant,
  badgeClassName,
  buttonText,
  buttonClassName,
  hoverColor,
  href,
}: AdminCardProps) {
  return (
    <Link
      to={href}
      className={`group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                  border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                  transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-1 block`}
      style={{
        fontFamily: APPLE_FONT_FAMILY,
        transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-br ${iconBgFrom.replace('/20', '/5')} to-transparent
                   opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-3 rounded-xl bg-gradient-to-br ${iconBgFrom} ${iconBgTo} shadow-sm
                        group-hover:shadow-lg group-hover:scale-105 transition-all duration-300`}
          >
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <Badge
            variant={badgeVariant}
            className={`text-xs ${badgeClassName || ''}`}
            style={{ fontWeight: 590 }}
          >
            {badgeContent}
          </Badge>
        </div>
        <h3
          className={`font-semibold mb-2 group-hover:${hoverColor} transition-colors duration-300`}
          style={{ fontWeight: 590, fontSize: '1rem' }}
        >
          {title}
        </h3>
        <p className="text-sm text-muted-foreground mb-4" style={{ fontWeight: 500 }}>
          {description}
        </p>
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            className={`text-xs ${buttonClassName} transition-all duration-300 rounded-lg pointer-events-none`}
            style={{ fontWeight: 500 }}
            tabIndex={-1}
          >
            {buttonText}
          </Button>
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground group-hover:${hoverColor}
                       transition-colors duration-300`}
          />
        </div>
      </div>
    </Link>
  );
}

export function PlatformAdministrationSection({ userCount }: PlatformAdministrationSectionProps) {
  return (
    <div className="mb-16">
      <div className="flex items-center gap-4 mb-8" style={{ fontFamily: APPLE_FONT_FAMILY }}>
        <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
            Platform Administration
          </h2>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
            System administration and user management overview
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* User Management Card */}
        <AdminCard
          title="User Management"
          description="Manage platform users, roles, and permissions"
          icon={Users}
          iconColor="text-primary"
          iconBgFrom="from-primary/20"
          iconBgTo="to-primary/10"
          badgeContent={userCount}
          badgeVariant="default"
          buttonText="Manage Users"
          buttonClassName="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
          hoverColor="text-primary"
          href="/admin/users"
        />

        {/* Alerts & Monitoring Card */}
        <AdminCard
          title="Alerts & Monitoring"
          description="View system alerts and notifications"
          icon={Activity}
          iconColor="text-emerald-600"
          iconBgFrom="from-emerald-500/20"
          iconBgTo="to-emerald-500/10"
          badgeContent="Active"
          badgeVariant="secondary"
          badgeClassName="bg-emerald-500/10 text-emerald-700"
          buttonText="View Alerts"
          buttonClassName="border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 hover:border-emerald-500/40"
          hoverColor="text-emerald-600"
          href="/admin/alerts"
        />

        <AdminCard
          title="Access Requests"
          description="Review new club admin requests"
          icon={ShieldCheck}
          iconColor="text-blue-600"
          iconBgFrom="from-blue-500/20"
          iconBgTo="to-blue-500/10"
          badgeContent="Review"
          badgeVariant="secondary"
          badgeClassName="bg-blue-500/10 text-blue-700"
          buttonText="Review Requests"
          buttonClassName="border-blue-500/20 text-blue-600 hover:bg-blue-500/5 hover:border-blue-500/40"
          hoverColor="text-blue-600"
          href="/admin/access-requests"
        />

        {/* Permissions Card */}
        <AdminCard
          title="Roles & Permissions"
          description="Manage roles, permissions, and access control"
          icon={Settings}
          iconColor="text-slate-600"
          iconBgFrom="from-slate-500/20"
          iconBgTo="to-slate-500/10"
          badgeContent="RBAC"
          badgeVariant="outline"
          badgeClassName="border-slate-500/20 text-slate-600"
          buttonText="Manage"
          buttonClassName="border-slate-500/20 text-slate-600 hover:bg-slate-500/5 hover:border-slate-500/40"
          hoverColor="text-slate-600"
          href="/admin/permissions"
        />
      </div>
    </div>
  );
}
