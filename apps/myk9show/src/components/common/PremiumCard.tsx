/**
 * PremiumCard Components
 * 
 * Apple-inspired card components with gradient backgrounds, backdrop blur,
 * and sophisticated hover effects. Automatically follows design system.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'standard' | 'feature' | 'stats' | 'minimal';
  hover?: boolean;
}

// Base Premium Card - Enhanced version of standard cards
export function PremiumCard({ 
  children, 
  className, 
  variant = 'standard',
  hover = true 
}: PremiumCardProps) {
  const cardClassName = cn(
    // Base styling
    "group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl",
    
    // Hover effects (conditional)
    hover && "transition-all duration-500 hover:shadow-xl hover:-translate-y-2",
    
    // Variant-specific styling
    variant === 'feature' && "p-8",
    variant === 'stats' && "p-6",
    variant === 'minimal' && "p-4",
    variant === 'standard' && "p-6",
    
    className
  );

  return (
    <Card className={cardClassName}>
      {hover && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      )}
      <div className="relative">
        {children}
      </div>
    </Card>
  );
}

// Feature Card - Enhanced version for marketing and landing sections
export interface FeatureCardProps extends PremiumCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  children,
  className,
  hover = true 
}: FeatureCardProps) {
  return (
    <PremiumCard variant="feature" hover={hover} className={className}>
      {Icon && (
        <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
          <Icon className="h-8 w-8 text-primary" />
        </div>
      )}
      <CardHeader className="p-0 pb-4">
        <CardTitle className="text-xl font-semibold group-hover:text-primary transition-colors duration-300">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-muted-foreground">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      {children && (
        <CardContent className="p-0">
          {children}
        </CardContent>
      )}
      {action && (
        <div className="pt-4">
          {action}
        </div>
      )}
    </PremiumCard>
  );
}

// Stats Card - Compact metrics cards
export interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  color?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  color = 'default',
  className 
}: StatsCardProps) {
  return (
    <PremiumCard variant="stats" className={className}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">
                {value}
              </p>
              {trend && (
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  trend.positive ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                )}>
                  {trend.positive ? '+' : ''}{trend.value}%
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300",
              color === "success" && "bg-gradient-to-br from-green-500/20 to-green-400/10",
              color === "warning" && "bg-gradient-to-br from-yellow-500/20 to-yellow-400/10",
              color === "danger" && "bg-gradient-to-br from-red-500/20 to-red-400/10",
              color === "default" && "bg-gradient-to-br from-primary/20 to-primary/10"
            )}>
              <Icon className={cn(
                "h-6 w-6",
                color === "success" && "text-green-500",
                color === "warning" && "text-yellow-500",
                color === "danger" && "text-red-500",
                color === "default" && "text-primary"
              )} />
            </div>
          )}
        </div>
      </CardContent>
    </PremiumCard>
  );
}

// Show Card - Specialized for show/event listings
export interface ShowCardProps {
  title: string;
  subtitle?: string;
  date?: string;
  location?: string;
  status?: string;
  image?: string;
  tags?: string[];
  action?: React.ReactNode;
  className?: string;
}

export function ShowCard({ 
  title, 
  subtitle, 
  date, 
  location, 
  status, 
  image, 
  tags, 
  action,
  className 
}: ShowCardProps) {
  return (
    <PremiumCard className={className}>
      {image && (
        <div className="relative h-48 -m-6 mb-4 overflow-hidden rounded-t-2xl">
          <img 
            src={image} 
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}
      
      <CardHeader className="p-0 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors duration-300">
              {title}
            </CardTitle>
            {subtitle && (
              <CardDescription className="text-sm text-muted-foreground mt-1">
                {subtitle}
              </CardDescription>
            )}
          </div>
          {status && (
            <span className={cn(
              "px-2 py-1 rounded-full text-xs font-medium",
              status === 'Open' && "bg-green-500/10 text-green-600",
              status === 'Closed' && "bg-red-500/10 text-red-600",
              status === 'Upcoming' && "bg-blue-500/10 text-blue-600"
            )}>
              {status}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-3">
        {date && (
          <div className="flex items-center text-sm text-muted-foreground">
            <span>{date}</span>
          </div>
        )}
        
        {location && (
          <div className="flex items-center text-sm text-muted-foreground">
            <span>{location}</span>
          </div>
        )}
        
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span 
                key={index}
                className="px-2 py-1 bg-muted/50 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        
        {action && (
          <div className="pt-2">
            {action}
          </div>
        )}
      </CardContent>
    </PremiumCard>
  );
}