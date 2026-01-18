/**
 * PremiumGate Component
 *
 * Consistent premium feature gate UI for locked content.
 * Displays a crown icon, feature title, description, and upgrade button.
 */

import { cn } from '@/lib/utils';
import { Crown, LucideIcon } from 'lucide-react';
import { PremiumButton } from './PremiumButton';
import { logger } from '@/services/LoggingService';

export interface PremiumGateProps {
  /** Feature title displayed prominently */
  title: string;
  /** Description of what the premium feature offers */
  description: string;
  /** Optional custom icon (defaults to Crown) */
  icon?: LucideIcon;
  /** Optional callback when upgrade button is clicked */
  onUpgrade?: () => void;
  /** Optional tracking context for analytics */
  trackingContext?: string;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export function PremiumGate({
  title,
  description,
  icon: Icon = Crown,
  onUpgrade,
  trackingContext,
  className,
  size = 'md'
}: PremiumGateProps) {
  const handleUpgrade = () => {
    logger.debug('Upgrade to Premium clicked', 'premium', { feature: trackingContext || title });
    onUpgrade?.();
  };

  const sizeConfig = {
    sm: {
      container: 'py-12',
      iconContainer: 'p-4 mb-4',
      iconSize: 'h-8 w-8',
      titleSize: 'text-lg',
      descriptionSize: 'text-sm',
      maxWidth: 'max-w-sm'
    },
    md: {
      container: 'py-16',
      iconContainer: 'p-6 mb-6',
      iconSize: 'h-12 w-12',
      titleSize: 'text-xl',
      descriptionSize: 'text-base',
      maxWidth: 'max-w-md'
    },
    lg: {
      container: 'py-20',
      iconContainer: 'p-8 mb-8',
      iconSize: 'h-16 w-16',
      titleSize: 'text-2xl',
      descriptionSize: 'text-lg',
      maxWidth: 'max-w-lg'
    }
  }[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeConfig.container,
        className
      )}
    >
      {/* Premium Icon */}
      <div
        className={cn(
          'bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full shadow-lg',
          sizeConfig.iconContainer
        )}
      >
        <Icon className={cn('text-white', sizeConfig.iconSize)} />
      </div>

      {/* Content */}
      <div className={cn('space-y-3', sizeConfig.maxWidth)}>
        <h3 className={cn('font-semibold text-foreground', sizeConfig.titleSize)}>
          {title}
        </h3>
        <p className={cn('text-muted-foreground', sizeConfig.descriptionSize)}>
          {description}
        </p>
      </div>

      {/* Upgrade Button */}
      <div className="mt-8">
        <PremiumButton
          variant="primary"
          icon={Crown}
          onClick={handleUpgrade}
          className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600"
        >
          Upgrade to Premium
        </PremiumButton>
      </div>
    </div>
  );
}

export default PremiumGate;
