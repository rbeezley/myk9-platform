import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Calendar,
  Heart,
  Pill,
  Shield,
  Stethoscope,
  FileText,
  Search,
  Filter,
  Download,
  Upload,
  Clock,
  AlertTriangle,
  CheckCircle,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadFile, exportToCSV } from '@/lib/export';

export interface HealthEvent {
  id: string;
  type: 'vaccination' | 'vet_visit' | 'medication' | 'allergy' | 'surgery' | 'checkup';
  title: string;
  description?: string | undefined;
  date: Date;
  vetName?: string | undefined;
  clinic?: string | undefined;
  cost?: number | undefined;
  status: 'completed' | 'scheduled' | 'overdue';
  attachments?: HealthAttachment[] | undefined;
  notes?: string | undefined;
  expiration?: Date | undefined;
}

interface HealthAttachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'lab_result';
  url: string;
  uploadedAt: Date;
  size?: number;
}

interface HealthTimelineProps {
  dogId: string;
  events: HealthEvent[];
  onEventClick?: (event: HealthEvent) => void;
  onAddEvent?: () => void;
  vaccinationsOnly?: boolean;
}

const eventTypeConfig = {
  vaccination: {
    icon: Shield,
    color: 'bg-green-500',
    label: 'Vaccination',
  },
  vet_visit: {
    icon: Stethoscope,
    color: 'bg-blue-500',
    label: 'Vet Visit',
  },
  medication: {
    icon: Pill,
    color: 'bg-purple-500',
    label: 'Medication',
  },
  allergy: {
    icon: AlertTriangle,
    color: 'bg-red-500',
    label: 'Allergy',
  },
  surgery: {
    icon: Heart,
    color: 'bg-orange-500',
    label: 'Surgery',
  },
  checkup: {
    icon: CheckCircle,
    color: 'bg-cyan-500',
    label: 'Checkup',
  },
};

const exportColumns = [
  'Date',
  'Type',
  'Title',
  'Status',
  'Description',
  'Veterinarian',
  'Clinic',
  'Cost',
  'Expiration Date',
  'Notes',
  'Attachments',
] as const;

export function HealthTimeline({
  dogId,
  events,
  onEventClick,
  onAddEvent,
  vaccinationsOnly = false,
}: HealthTimelineProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>(vaccinationsOnly ? 'vaccination' : 'all');
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        event =>
          event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.vetName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(event => event.type === filterType);
    }

    // Year filter
    if (selectedYear) {
      filtered = filtered.filter(event => event.date.getFullYear() === selectedYear);
    }

    return filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events, searchTerm, filterType, selectedYear]);

  const eventsByYear = useMemo(() => {
    const grouped: Record<number, HealthEvent[]> = {};
    filteredEvents.forEach(event => {
      const year = event.date.getFullYear();
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(event);
    });
    return grouped;
  }, [filteredEvents]);

  const years = Object.keys(eventsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  const getExportFilename = () => {
    const today = new Date().toISOString().split('T')[0];
    return `${dogId}-health-timeline-${today}`;
  };

  const handleExportTimeline = () => {
    const filename = getExportFilename();

    if (events.length === 0) {
      const headers = exportColumns.map(column => `"${column}"`).join(',');
      downloadFile(headers, `${filename}.csv`, 'text/csv');
      return;
    }

    const exportRows =
      events
        .slice()
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map(event => ({
          Date: event.date,
          Type: eventTypeConfig[event.type].label,
          Title: event.title,
          Status: event.status.charAt(0).toUpperCase() + event.status.slice(1),
          Description: event.description || '',
          Veterinarian: event.vetName || '',
          Clinic: event.clinic || '',
          Cost: event.cost ?? '',
          'Expiration Date': event.expiration || '',
          Notes: event.notes || '',
          Attachments: event.attachments?.map(attachment => attachment.name).join('; ') || '',
        }));

    exportToCSV(exportRows, filename, { dateFormat: 'YYYY-MM-DD' });
  };

  const getStatusBadge = (status: string, expiration?: Date) => {
    if (status === 'overdue' || (expiration && expiration < new Date())) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (status === 'scheduled') {
      return <Badge variant="secondary">Scheduled</Badge>;
    }
    return <Badge variant="default">Completed</Badge>;
  };

  const EventItem = ({ event, isLast = false }: { event: HealthEvent; isLast?: boolean }) => {
    const config = eventTypeConfig[event.type];
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
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Health Timeline</h2>
        </div>

        {!vaccinationsOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Import Records
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportTimeline}>
              <Download className="h-4 w-4 mr-2" />
              Export Timeline
            </Button>
            <Button size="sm" onClick={onAddEvent}>
              <Plus className="h-4 w-4" />
              Add Event
            </Button>
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search health records..."
                  value={''}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex gap-2">
              {!vaccinationsOnly && (
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">All Types</option>
                  {Object.entries(eventTypeConfig).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={''}
                onChange={e => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="">All Years</option>
                {years.map(year => (
                  <option key={year} value={''}>
                    {year}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'timeline' ? 'grid' : 'timeline')}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'timeline' ? (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {years.map(year => (
              <div key={year}>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {year}
                  <Badge variant="outline">{eventsByYear[year].length} events</Badge>
                </h3>
                <div className="space-y-6">
                  {eventsByYear[year].map((event, index) => (
                    <EventItem
                      key={event.id}
                      event={event}
                      isLast={index === eventsByYear[year].length - 1}
                    />
                  ))}
                </div>
                {year !== years[years.length - 1] && <Separator className="my-8" />}
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredEvents.map(event => (
              <EventItem key={event.id} event={event} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {filteredEvents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Heart className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Health Records Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm || filterType !== 'all'
                ? 'Try adjusting your search or filters'
                : "Start tracking your dog's health by adding the first record"}
            </p>
            <Button onClick={onAddEvent}>
              <Plus className="h-4 w-4" />
              Add Health Record
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
