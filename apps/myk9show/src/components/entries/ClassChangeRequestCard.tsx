/**
 * One request in the class change list (MYK9-1978): complete enough to decide
 * on sight. Dog, from class, the class the exhibitor asked for, why, and when.
 *
 * The class asked for is the stored `class_change_target_class_id`. A request
 * with none stored (a legacy, secretary-made move-up) says the class is chosen
 * at accept, which is the only case that keeps the class picker.
 */
import React from 'react';
import { ArrowRight, Check, Clock, Dog, Trophy, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatEntryDateTime } from '@/lib/format/dates';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { armbandAccessibleName } from '@/utils/armbandUtils';

export interface ClassChangeRequestView {
  id: string;
  dogName: string;
  registeredName: string | null;
  armband: string | null;
  handler: string | null;
  fromClass: string;
  /** The trial the dog is in now. */
  trialLabel: string | null;
  /** The class asked for; null for a request with no stored target. */
  requestedClass: string | null;
  /** The class asked for's trial, only when it is another trial (MYK9-2129). */
  requestedTrialLabel: string | null;
  /** The reason in plain words, when one is stored. */
  reasonLabel: string | null;
  /** When the exhibitor asked; the row's creation time for a legacy request. */
  askedAt: string | null;
  /** "asked 12 minutes before start", only for a request inside the deadline. */
  lateNote: string | null;
  /** "4 of 12 entered" for the class asked for; null when its count is unknown. */
  enteredNote: string | null;
}

interface ClassChangeRequestCardProps {
  request: ClassChangeRequestView;
  /** Whether the stored target could not be read, so Accept cannot be trusted. */
  acceptDisabledReason: string | null;
  onAccept: () => void;
  onDecline: () => void;
  isBusy: boolean;
}

export const ClassChangeRequestCard: React.FC<ClassChangeRequestCardProps> = ({
  request,
  acceptDisabledReason,
  onAccept,
  onDecline,
  isBusy,
}) => (
  <Card className="hover:bg-muted/50 transition-colors">
    <CardContent className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Dog className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{request.dogName}</span>
              {request.registeredName && (
                <span className="text-muted-foreground">({request.registeredName})</span>
              )}
              {armbandAccessibleName(request.armband) && (
                <ArmbandBadge armband={request.armband} srLabel className="h-6 min-w-6 text-xs" />
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Handler: {request.handler || 'Not specified'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
            data-testid="class-change-line"
          >
            <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">{request.fromClass}</span>
            <ArrowRight className="h-4 w-4 text-blue-500" aria-hidden />
            {request.requestedClass ? (
              <span className="font-medium">{request.requestedClass}</span>
            ) : (
              <span className="italic text-muted-foreground">Chosen at accept</span>
            )}
            {/* The requested class's trial and count sit next to its name, not the current trial. */}
            {(request.requestedTrialLabel || request.enteredNote) && (
              <span
                className="text-sm text-muted-foreground"
                data-testid="class-change-target-facts"
              >
                {[
                  request.requestedTrialLabel && `in ${request.requestedTrialLabel}`,
                  request.enteredNote,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {[
              request.requestedTrialLabel && request.trialLabel
                ? `From ${request.trialLabel}`
                : request.trialLabel,
              request.reasonLabel,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden />
            {request.askedAt ? `Asked ${formatEntryDateTime(request.askedAt)}` : 'Not recorded'}
          </div>
          {request.lateNote && (
            <Badge variant="outline" data-testid="class-change-late-note">
              Late: {request.lateNote}
            </Badge>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isBusy || acceptDisabledReason !== null}
              title={acceptDisabledReason ?? undefined}
            >
              <Check className="mr-1 h-4 w-4" aria-hidden />
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDecline}
              disabled={isBusy}
            >
              <X className="mr-1 h-4 w-4" aria-hidden />
              Decline
            </Button>
          </div>
        </div>
      </div>
      {acceptDisabledReason && (
        <p className="mt-2 text-sm text-destructive">{acceptDisabledReason}</p>
      )}
    </CardContent>
  </Card>
);
