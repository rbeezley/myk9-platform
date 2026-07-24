import type { ReactNode } from 'react';
import { Calendar, Clock, FileText, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HealthEvent } from './HealthTimeline';

interface TimelineEventConfig {
  icon: LucideIcon;
  color: string;
  label: string;
}

interface HealthTimelineEventProps {
  event: HealthEvent;
  config: TimelineEventConfig;
  viewMode: 'timeline' | 'grid';
  isLast?: boolean;
  getStatusBadge: (status: string, expiration?: Date) => ReactNode;
  onEventClick?: (event: HealthEvent) => void;
  onDeleteEvent?: (event: HealthEvent) => void;
}

export function HealthTimelineEvent({
  event,
  config,
  viewMode,
  isLast = false,
  getStatusBadge,
  onEventClick,
  onDeleteEvent,
}: HealthTimelineEventProps) {
  const IconComponent = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative"
    >
      {viewMode === 'timeline' && !isLast && (
        <div className="absolute left-6 top-16 w-0.5 h-full bg-border z-0" />
      )}

      <div className="flex gap-4">
        {viewMode === 'timeline' && (
          <div
            className={cn(
              'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center z-10',
              config.color
            )}
          >
            <IconComponent className="h-6 w-6 text-white" />
          </div>
        )}

        <Card
          className={cn(
            'flex-1 cursor-pointer hover:shadow-md transition-shadow',
            viewMode === 'grid' && 'h-full'
          )}
          onClick={() => onEventClick?.(event)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {viewMode === 'grid' && (
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      config.color
                    )}
                  >
                    <IconComponent className="h-4 w-4 text-white" />
                  </div>
                )}
                <div>
                  <CardTitle className="text-lg">{event.title}</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {event.date.toLocaleDateString()}
                    {event.vetName && (
                      <>
                        <span>•</span>
                        <span>Dr. {event.vetName}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(event.status, event.expiration)}
                <Badge variant="outline">{config.label}</Badge>
                {onDeleteEvent && event.recordId && event.recordType && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clickEvent => {
                      clickEvent.stopPropagation();
                      onDeleteEvent(event);
                    }}
                    aria-label={`Delete ${event.title}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          {(event.description || event.attachments?.length || event.cost) && (
            <CardContent className="pt-0">
              {event.description && (
                <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
              )}

              {event.attachments && event.attachments.length > 0 && (
                <div className="flex gap-2 mb-3">
                  {event.attachments.slice(0, 3).map(attachment => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
                    >
                      <FileText className="h-3 w-3" />
                      {attachment.name}
                    </div>
                  ))}
                  {event.attachments.length > 3 && (
                    <div className="text-xs text-muted-foreground px-2 py-1">
                      +{event.attachments.length - 3} more
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                {event.cost && <span className="text-sm font-medium">${event.cost}</span>}

                {event.expiration && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Next: {event.expiration.toLocaleDateString()}
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </motion.div>
  );
}
