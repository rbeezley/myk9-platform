import { useState, useMemo, useCallback, memo, startTransition } from 'react';
import { Calendar, ViewName, Event } from 'react-big-calendar';
import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Calendar as CalendarIcon, MapPin, Users, Trophy } from 'lucide-react';
import { useShowStore } from '../../../store/showStore';
import { useNavigate } from 'react-router-dom';
import type { Show } from '../../../types/show-types';
import { motion } from 'framer-motion';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '@/styles/calendar-performance.css';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Show & Record<string, unknown>;
  allDay?: boolean;
}

interface ShowCalendarProps {
  className?: string;
  height?: number;
  onShowRegister?: (showId: string) => void;
  shows?: Show[]; // Optional shows prop for filtering support
}

function ShowCalendarComponent({
  className,
  height = 600,
  onShowRegister,
  shows: propShows,
}: ShowCalendarProps) {
  const { shows: storeShows } = useShowStore();
  const shows = propShows || storeShows;
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<ViewName>('month');
  const [date, setDate] = useState(new Date());

  // Optimize event creation with better memoization and date caching
  const events = useMemo<CalendarEvent[]>(() => {
    // Pre-cache date objects to avoid repeated Date() constructor calls
    const dateCache = new Map<string, Date>();

    const getDate = (dateString: string): Date => {
      if (!dateCache.has(dateString)) {
        dateCache.set(dateString, new Date(dateString));
      }
      return dateCache.get(dateString)!;
    };

    return shows.map(show => ({
      id: show.id,
      title: show.name,
      start: getDate(show.startDate),
      end: getDate(show.endDate || show.startDate),
      resource: show as Show & Record<string, unknown>,
      allDay: true,
    }));
  }, [shows]);

  // Memoize style getter to prevent recalculations
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const show = event.resource;
    let backgroundColor = '#3b82f6'; // Default blue

    // Color code by show type or status
    if (show.status === 'cancelled') {
      backgroundColor = '#ef4444'; // Red
    } else if (show.status === 'completed') {
      backgroundColor = '#10b981'; // Green
    } else if (show.status === 'active') {
      backgroundColor = '#f59e0b'; // Amber
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
        fontSize: '12px',
        fontWeight: '500',
      },
    };
  }, []);

  const CustomToolbar = ({
    label,
    onNavigate,
    onView,
  }: {
    label: string;
    onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY' | 'DATE') => void;
    onView: (view: ViewName) => void;
  }) => (
    <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate('PREV')}>
          ←
        </Button>
        <h3 className="text-lg font-semibold min-w-[200px] text-center">{label}</h3>
        <Button variant="outline" size="sm" onClick={() => onNavigate('NEXT')}>
          →
        </Button>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'month' as ViewName, label: 'Month' },
          { key: 'week' as ViewName, label: 'Week' },
          { key: 'day' as ViewName, label: 'Day' },
          { key: 'agenda' as ViewName, label: 'Agenda' },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={view === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => onView(key as ViewName)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );

  // Memoize custom event component
  const CustomEvent = memo(({ event }: { event: Event }) => (
    <div className="flex items-center gap-1 truncate">
      <CalendarIcon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate text-xs">{event.title}</span>
    </div>
  ));

  // Memoize calendar event handlers to prevent recreating on every render
  const handleViewChange = useCallback((newView: ViewName) => setView(newView), []);
  const handleNavigate = useCallback((newDate: Date) => setDate(newDate), []);
  const handleSelectEvent = useCallback((event: Event) => {
    setSelectedEvent(event as unknown as CalendarEvent);
  }, []);

  return (
    <motion.div
      className={`calendar-motion-container ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Show Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="calendar-critical">
            <Calendar
              localizer={localizer}
              events={events as Event[]}
              startAccessor="start"
              endAccessor="end"
              style={{ height }}
              view={view}
              onView={handleViewChange}
              date={date}
              onNavigate={handleNavigate}
              eventPropGetter={(event: Event) =>
                eventStyleGetter(event as unknown as CalendarEvent)
              }
              onSelectEvent={handleSelectEvent}
              popup
              components={{
                toolbar: CustomToolbar,
                event: CustomEvent,
              }}
              className="custom-calendar"
            />
          </div>
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-md bg-card dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <Trophy className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  {selectedEvent.resource.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-gray-900 dark:text-gray-100">
                    {format(selectedEvent.start, 'MMMM do, yyyy')}
                    {selectedEvent.resource.endDate &&
                      selectedEvent.end instanceof Date &&
                      ` - ${format(selectedEvent.end, 'MMMM do, yyyy')}`}
                  </span>
                </div>

                {selectedEvent.resource.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-gray-900 dark:text-gray-100">
                      {selectedEvent.resource.location}
                    </span>
                  </div>
                )}

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedEvent.resource.organization} - {selectedEvent.resource.location}
                </p>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      selectedEvent.resource.status === 'completed'
                        ? 'default'
                        : selectedEvent.resource.status === 'active'
                          ? 'secondary'
                          : selectedEvent.resource.status === 'cancelled'
                            ? 'destructive'
                            : 'outline'
                    }
                  >
                    {selectedEvent.resource.status || 'Scheduled'}
                  </Badge>

                  {selectedEvent.resource.trials && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{selectedEvent.resource.trials.length} trials</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  {onShowRegister && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onShowRegister(selectedEvent.resource.id);
                        setSelectedEvent(null);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Register for This Show
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      startTransition(() => {
                        navigate(`/shows/${selectedEvent.resource.id}`);
                      });
                      setSelectedEvent(null);
                    }}
                  >
                    View Details
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const ShowCalendar = memo(ShowCalendarComponent);
