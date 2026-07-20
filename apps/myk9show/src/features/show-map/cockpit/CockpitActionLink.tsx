import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { SecretaryCockpitAction, SecretaryCockpitAttention } from './secretaryCockpitTypes';

type Destination =
  SecretaryCockpitAction['destination'] | NonNullable<SecretaryCockpitAttention['destination']>;

export function CockpitActionLink({
  destination,
  children,
  className,
  variant = 'default',
  onCommand,
}: {
  destination: Destination;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  onCommand: (commandId: string) => void;
}) {
  const content = (
    <>
      <span>{children}</span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </>
  );
  if (destination.kind === 'href') {
    return (
      <Button asChild variant={variant} className={cn('justify-between', className)}>
        <Link to={destination.href}>{content}</Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={variant}
      className={cn('justify-between', className)}
      onClick={() => onCommand(destination.commandId)}
    >
      {content}
    </Button>
  );
}
