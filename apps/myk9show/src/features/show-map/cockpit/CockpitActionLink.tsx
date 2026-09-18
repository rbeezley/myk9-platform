import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useTrialSecretaryOnlyReason } from '@/features/actions/TrialSecretaryAccessContext';

import type { SecretaryCockpitAction, SecretaryCockpitAttention } from './secretaryCockpitTypes';

type Destination =
  SecretaryCockpitAction['destination'] | NonNullable<SecretaryCockpitAttention['destination']>;

export function CockpitActionLink({
  destination,
  children,
  className,
  variant = 'default',
  onCommand,
  operatorOnly = false,
}: {
  destination: Destination;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  onCommand: (commandId: string) => void;
  /**
   * True when this action's destination is secretary-only
   * (`ProtectedRoute(SECRETARY | JUDGE | SITE_ADMIN)`), e.g. "Enter paper
   * scores" -> `/scoring/classes/:id/entries`. Greyed with the surface's reason
   * for a manager who is not an operator, instead of leading them into a
   * refusal (REV-2341 R-1).
   */
  operatorOnly?: boolean;
}) {
  const surfaceReason = useTrialSecretaryOnlyReason();
  const disabledReason = operatorOnly ? surfaceReason : undefined;
  const content = (
    <>
      <span>{children}</span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </>
  );
  if (disabledReason !== undefined) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <Button
          type="button"
          variant={variant}
          className="min-h-11 justify-between"
          disabled
          aria-describedby="cockpit-action-disabled-reason"
        >
          {content}
        </Button>
        <p id="cockpit-action-disabled-reason" className="text-xs text-muted-foreground">
          {disabledReason}
        </p>
      </div>
    );
  }
  if (destination.kind === 'href') {
    return (
      <Button asChild variant={variant} className={cn('min-h-11 justify-between', className)}>
        <Link to={destination.href}>{content}</Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={variant}
      className={cn('min-h-11 justify-between', className)}
      onClick={() => onCommand(destination.commandId)}
    >
      {content}
    </Button>
  );
}
