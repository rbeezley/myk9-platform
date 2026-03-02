/**
 * StatsCard Component
 *
 * Premium stats card with premium styling and animations.
 */

import { TrendingUp } from 'lucide-react';
import type { StatsCardProps } from './admin-dashboard-types';

const APPLE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  actionable = false,
  onClick,
}: StatsCardProps) {
  return (
    <div
      className={`group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                  border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                  transition-all duration-300 hover:shadow-xl hover:-translate-y-1
                  min-h-[140px] ${actionable ? 'cursor-pointer' : ''}`}
      style={{
        fontFamily: APPLE_FONT_FAMILY,
        transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
      onClick={actionable ? onClick : undefined}
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                   opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />
      <div className="relative h-full flex flex-col justify-between">
        {/* Header with Icon */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
              style={{ fontWeight: 590, letterSpacing: '0.02em' }}
            >
              {title}
            </p>
          </div>
          <div
            className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm
                       group-hover:shadow-lg group-hover:scale-105 transition-all duration-300"
          >
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>

        {/* Main Value */}
        <div className="flex-1 flex flex-col justify-center">
          <p
            className="text-2xl font-bold mb-1 group-hover:text-primary transition-colors duration-300"
            style={{ fontWeight: 650, lineHeight: '1.25' }}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Trend Information */}
        {trend && trendValue && (
          <div
            className={`flex items-center text-sm mt-3 ${
              trend === 'up'
                ? 'text-emerald-600'
                : trend === 'down'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }`}
            style={{ fontWeight: 500 }}
          >
            {trend === 'up' && <TrendingUp className="h-4 w-4 mr-1.5" />}
            {trend === 'down' && <TrendingUp className="h-4 w-4 mr-1.5 rotate-180" />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}
