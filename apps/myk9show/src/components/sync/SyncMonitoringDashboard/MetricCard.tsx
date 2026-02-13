import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { cn } from '../../../lib/utils';
import type { MetricCardProps } from './types';

const statusColors = {
  success: 'text-green-600 bg-green-50 border-green-200',
  warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  error: 'text-red-600 bg-red-50 border-red-200',
  neutral: 'text-gray-600 bg-gray-50 border-gray-200'
};

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  status = 'neutral',
  onClick
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden cursor-pointer transition-all duration-300",
          "hover:shadow-lg hover:border-primary/20",
          onClick && "cursor-pointer"
        )}
        onClick={onClick}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className={cn("p-2 rounded-lg", statusColors[status])}>
              {icon}
            </div>
            {trend !== undefined && (
              <div className="flex items-center gap-1">
                {trend > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  trend > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {Math.abs(trend)}%
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export { MetricCard };
