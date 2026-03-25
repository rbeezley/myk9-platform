import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StatCardProps } from './AnalyticsDashboard.types';

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'default',
}) => (
  <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border/30 rounded-2xl shadow-card backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <CardContent className="relative p-6">
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
              <Badge
                variant={trend.positive ? 'default' : 'destructive'}
                className="text-xs px-2 py-1 rounded-full"
              >
                {trend.positive ? '+' : ''}
                {trend.value}%
              </Badge>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300',
            color === 'success' && 'bg-gradient-to-br from-green-500/20 to-green-400/10',
            color === 'warning' && 'bg-gradient-to-br from-yellow-500/20 to-yellow-400/10',
            color === 'danger' && 'bg-gradient-to-br from-red-500/20 to-red-400/10',
            color === 'default' && 'bg-gradient-to-br from-primary/20 to-primary/10'
          )}
        >
          <Icon
            className={cn(
              'h-6 w-6',
              color === 'success' && 'text-green-500',
              color === 'warning' && 'text-yellow-500',
              color === 'danger' && 'text-red-500',
              color === 'default' && 'text-primary'
            )}
          />
        </div>
      </div>
    </CardContent>
  </Card>
);
