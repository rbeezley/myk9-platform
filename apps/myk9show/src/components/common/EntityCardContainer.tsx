import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { buildClasses } from '@/utils/designTokens';

interface EntityCardContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Provides standardized card styling for entity detail pages (Club, Dog, Show, User).
 * This component handles ONLY the card styling and should be used within an EntityPageLayout.
 * 
 * Usage pattern:
 * <EntityPageLayout>
 *   <EntityCardContainer>
 *     {entity content}
 *   </EntityCardContainer>
 * </EntityPageLayout>
 */
const EntityCardContainer: React.FC<EntityCardContainerProps> = ({
  children,
  className = '',
}) => (
  <Card className={cn(
    buildClasses.card.base,
    'w-full overflow-hidden',
    className
  )}>
    <div className="p-6">
      {children}
    </div>
  </Card>
);

export default EntityCardContainer;
