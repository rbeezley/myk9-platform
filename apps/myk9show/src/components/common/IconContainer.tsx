/**
 * IconContainer Component
 * 
 * Premium icon containers with gradient backgrounds, rounded corners,
 * and sophisticated hover effects. Automatically follows design system.
 */


import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface IconContainerProps {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'premium' | undefined;
  hover?: boolean;
  rounded?: 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  onClick?: (() => void) | undefined;
}

export function IconContainer({
  icon: Icon,
  size = 'md',
  variant = 'default',
  hover = true,
  rounded = 'xl',
  className,
  onClick
}: IconContainerProps) {
  const isClickable = !!onClick;

  // Size configurations
  const sizeConfig = {
    sm: { container: 'w-8 h-8', icon: 'h-4 w-4' },
    md: { container: 'w-12 h-12', icon: 'h-6 w-6' },
    lg: { container: 'w-16 h-16', icon: 'h-8 w-8' },
    xl: { container: 'w-20 h-20', icon: 'h-10 w-10' }
  }[size];

  // Variant configurations
  const variantConfig = {
    default: {
      background: 'bg-gradient-to-br from-primary/20 to-primary/10',
      iconColor: 'text-primary'
    },
    success: {
      background: 'bg-gradient-to-br from-green-500/20 to-green-400/10',
      iconColor: 'text-green-500'
    },
    warning: {
      background: 'bg-gradient-to-br from-yellow-500/20 to-yellow-400/10',
      iconColor: 'text-yellow-500'
    },
    danger: {
      background: 'bg-gradient-to-br from-red-500/20 to-red-400/10',
      iconColor: 'text-red-500'
    },
    info: {
      background: 'bg-gradient-to-br from-blue-500/20 to-blue-400/10',
      iconColor: 'text-blue-500'
    },
    premium: {
      background: 'bg-gradient-to-br from-yellow-500/20 to-orange-400/10',
      iconColor: 'text-yellow-500'
    }
  }[variant];

  // Border radius configurations
  const roundedClass = {
    md: 'rounded-md',
    lg: 'rounded-lg', 
    xl: 'rounded-xl',
    full: 'rounded-full'
  }[rounded];

  const containerClassName = cn(
    // Base styling
    sizeConfig.container,
    roundedClass,
    variantConfig.background,
    "flex items-center justify-center shadow-sm",
    
    // Hover effects
    hover && "transition-all duration-300",
    hover && !isClickable && "group-hover:shadow-xl group-hover:scale-110",
    
    // Clickable styling
    isClickable && [
      "cursor-pointer transition-all duration-300",
      "hover:shadow-xl hover:scale-110 active:scale-95"
    ],
    
    className
  );

  const iconClassName = cn(
    sizeConfig.icon,
    variantConfig.iconColor
  );

  const ContainerElement = isClickable ? 'button' : 'div';

  return (
    <ContainerElement 
      className={containerClassName}
      onClick={onClick}
      type={isClickable ? 'button' : undefined}
    >
      <Icon className={iconClassName} />
    </ContainerElement>
  );
}

// Specialized variants

// Status Icon - For status indicators
export interface StatusIconProps extends Omit<IconContainerProps, 'variant'> {
  status: 'success' | 'warning' | 'error' | 'pending' | 'info';
}

export function StatusIcon({ status, ...props }: StatusIconProps) {
  const statusVariant = {
    success: 'success',
    warning: 'warning', 
    error: 'danger',
    pending: 'warning',
    info: 'info'
  }[status] as IconContainerProps['variant'];

  return <IconContainer variant={statusVariant} {...props} />;
}

// Feature Icon - For feature highlights
export interface FeatureIconProps extends Omit<IconContainerProps, 'variant'> {
  featured?: boolean;
}

export function FeatureIcon({ featured = false, size = 'lg', ...props }: FeatureIconProps) {
  return (
    <IconContainer
      size={size}
      variant={featured ? 'premium' : 'default'}
      {...props}
    />
  );
}

// Metric Icon - For dashboard metrics
export interface MetricIconProps extends Omit<IconContainerProps, 'hover'> {
  value?: string | number;
  trend?: 'up' | 'down' | 'neutral';
}

export function MetricIcon({ 
  value, 
  trend, 
  variant = 'default',
  className,
  ...props 
}: MetricIconProps) {
  // Auto-select variant based on trend
  const trendVariant = trend 
    ? trend === 'up' 
      ? 'success' 
      : trend === 'down' 
        ? 'danger' 
        : 'info'
    : variant;

  return (
    <div className="flex flex-col items-center space-y-2">
      <IconContainer 
        variant={trendVariant}
        hover={true}
        className={cn("group-hover:scale-110", className)}
        {...props} 
      />
      {value && (
        <span className="text-sm font-semibold text-muted-foreground">
          {value}
        </span>
      )}
    </div>
  );
}

// Icon Grid - For displaying multiple icons in a grid
export interface IconGridProps {
  icons: Array<{
    icon: LucideIcon;
    label?: string;
    variant?: IconContainerProps['variant'];
    onClick?: () => void;
  }>;
  columns?: 2 | 3 | 4 | 6;
  className?: string;
}

export function IconGrid({ 
  icons, 
  columns = 3,
  className 
}: IconGridProps) {
  const gridClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3', 
    4: 'grid-cols-4',
    6: 'grid-cols-6'
  }[columns];

  return (
    <div className={cn("grid gap-4", gridClass, className)}>
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center space-y-2">
          <IconContainer
            icon={item.icon}
            variant={item.variant}
            onClick={item.onClick}
          />
          {item.label && (
            <span className="text-xs text-muted-foreground font-medium text-center">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Quick Action Icons - For floating action menus
export interface QuickActionIconProps extends IconContainerProps {
  label: string;
  badge?: string | number;
}

export function QuickActionIcon({ 
  label, 
  badge, 
  className,
  ...props 
}: QuickActionIconProps) {
  return (
    <div className="relative group">
      <IconContainer 
        size="lg"
        className={cn("shadow-lg", className)}
        {...props}
      />
      
      {/* Label tooltip */}
      <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-xs bg-black/80 text-white px-2 py-1 rounded whitespace-nowrap">
          {label}
        </span>
      </div>

      {/* Badge */}
      {badge && (
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[1.25rem] h-5 flex items-center justify-center">
          {badge}
        </div>
      )}
    </div>
  );
}