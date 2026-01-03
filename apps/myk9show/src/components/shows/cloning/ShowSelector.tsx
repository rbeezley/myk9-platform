import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search,
  Calendar,
  MapPin,
  Building2,
  Trophy,
  Users,
  DollarSign,
  Filter,
  Copy,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// Show selector type that matches the ShowCloneDialog interface expectations
interface ShowSelectorShow {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  clubId?: string;
  entryDeadline?: string;
  entryCloseDate?: string;
  entryFee?: number;
  preEntryFee?: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  trials?: Array<{
    id: string;
    name: string;
    dateTime: string; // Updated to match new structure
    eventNumber: string;
    classes: Array<{
      templateId: string;
      customizations: Record<string, unknown>;
      judgeId?: string;
    }>;
  }>;
  classes?: { id: string; name: string }[];
  judgeIds?: string[];
}

interface ShowSelectorProps {
  shows: ShowSelectorShow[];
  onShowSelected: (show: ShowSelectorShow) => void;
  className?: string;
}

type SortField = 'name' | 'date' | 'type' | 'location';
type SortDirection = 'asc' | 'desc';

export const ShowSelector: React.FC<ShowSelectorProps> = ({
  shows,
  onShowSelected,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Get available filter options
  const availableYears = useMemo(() => {
    const years = new Set(
      shows.map(show => new Date(show.startDate).getFullYear().toString())
    );
    return Array.from(years).sort().reverse();
  }, [shows]);

  const availableTypes = useMemo(() => {
    const types = new Set(shows.map(show => show.type));
    return Array.from(types).sort();
  }, [shows]);

  // Filter and sort shows
  const filteredShows = useMemo(() => {
    const filtered = shows.filter(show => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!show.name.toLowerCase().includes(query) && 
            !show.location.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Year filter
      if (selectedYear !== 'all') {
        const showYear = new Date(show.startDate).getFullYear().toString();
        if (showYear !== selectedYear) return false;
      }

      // Type filter
      if (selectedType !== 'all' && show.type !== selectedType) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && show.status !== selectedStatus) {
        return false;
      }

      return true;
    });

    // Sort shows
    filtered.sort((a, b) => {
      let aValue: string | Date, bValue: string | Date;
      
      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.startDate);
          bValue = new Date(b.startDate);
          break;
        case 'type':
          aValue = a.type;
          bValue = b.type;
          break;
        case 'location':
          aValue = a.location.toLowerCase();
          bValue = b.location.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [shows, searchQuery, selectedYear, selectedType, selectedStatus, sortField, sortDirection]);

  // Handle sort change
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get show statistics
  const getShowStats = (show: ShowSelectorShow) => {
    const trialCount = show.trials?.length || 0;
    const classCount = show.classes?.length || 0;
    const judgeCount = show.judgeIds?.length || 0;
    
    return { trialCount, classCount, judgeCount };
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-semibold">Select Show to Clone</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose an existing show to use as a template for your new show
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shows by name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {availableTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('date')}
                  className="h-8 px-2"
                >
                  Date
                  {sortField === 'date' && (
                    sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-1" /> : <SortDesc className="h-3 w-3 ml-1" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('name')}
                  className="h-8 px-2"
                >
                  Name
                  {sortField === 'name' && (
                    sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-1" /> : <SortDesc className="h-3 w-3 ml-1" />
                  )}
                </Button>
              </div>
            </div>

            {/* Results count */}
            <div className="text-sm text-muted-foreground">
              {filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''} found
            </div>
          </CardContent>
        </Card>

        {/* Show list */}
        <div className="space-y-3">
          {filteredShows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Shows Found</h3>
                <p className="text-muted-foreground mb-4">
                  No shows match your current search and filter criteria.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedYear('all');
                    setSelectedType('all');
                    setSelectedStatus('all');
                  }}
                >
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredShows.map((show) => {
              const stats = getShowStats(show);
              return (
                <Card
                  key={show.id}
                  className="cursor-pointer transition-all hover:shadow-md hover:bg-muted/20"
                  onClick={() => onShowSelected(show)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-lg">{show.name}</h4>
                            <div className="flex items-center gap-3 mt-1">
                              <Badge variant="outline">{show.type}</Badge>
                              <Badge className={getStatusColor(show.status)}>
                                {show.status}
                              </Badge>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {format(parseISO(show.startDate), 'MMM d, yyyy')} - {format(parseISO(show.endDate), 'MMM d, yyyy')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{show.location}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span>${show.entryFee || show.preEntryFee || 'TBD'} entry fee</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Trophy className="h-4 w-4 text-blue-500" />
                              <span>{stats.trialCount} trial{stats.trialCount !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-green-500" />
                              <span>{stats.classCount} class{stats.classCount !== 1 ? 'es' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-purple-500" />
                              <span>{stats.judgeCount} judge{stats.judgeCount !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>

                        {/* Entry deadline */}
                        <div className="text-xs text-muted-foreground">
                          Entry deadline: {show.entryDeadline ? format(parseISO(show.entryDeadline), 'MMM d, yyyy') : 
                            show.entryCloseDate ? format(parseISO(show.entryCloseDate), 'MMM d, yyyy') : 'TBD'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Info card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <Copy className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">About Show Cloning</h4>
                <p className="text-sm text-blue-700">
                  Cloning creates a new show based on an existing one, automatically updating dates 
                  and allowing you to modify judges, fees, and other details. This is perfect for 
                  annual events or similar show formats.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShowSelector;