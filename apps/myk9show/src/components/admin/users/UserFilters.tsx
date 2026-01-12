/**
 * UserFilters Component - Advanced filtering controls for user management
 * 
 * Features:
 * - Role-based filtering with statistics
 * - Status filtering (active/inactive/suspended)
 * - Club affiliation filtering
 * - Date range filtering
 * - Filter reset functionality
 */

import React from 'react';
import { logger } from '@/services/LoggingService';
import { X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

import { UserFilter } from '@/pages/admin/UserManagementPage';

interface UserFiltersProps {
  filters: UserFilter;
  onFiltersChange: (filters: UserFilter) => void;
  roleStats: Record<string, number>;
}

// Role display configuration
const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'exhibitor', label: 'Exhibitor' },
  { value: 'handler', label: 'Handler' },
  { value: 'judge', label: 'Judge' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'steward', label: 'Steward' },
  { value: 'admin', label: 'Admin' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
] as const;

export const UserFilters: React.FC<UserFiltersProps> = ({
  filters,
  onFiltersChange,
  roleStats
}) => {
  // Update individual filter values
  const updateFilter = <K extends keyof UserFilter>(
    key: K,
    value: UserFilter[K]
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  // Reset all filters
  const resetFilters = () => {
    onFiltersChange({
      search: '',
      role: 'all',
      status: 'all',
      clubAffiliation: '',
      dateRange: { start: null, end: null }
    });
  };

  // Check if any filters are active
  const hasActiveFilters = 
    filters.role !== 'all' ||
    filters.status !== 'all' ||
    filters.clubAffiliation !== '' ||
    filters.dateRange.start !== null ||
    filters.dateRange.end !== null;

  // Handle date range changes
  const handleStartDateChange = (date: Date | undefined) => {
    updateFilter('dateRange', {
      ...filters.dateRange,
      start: date || null
    });
  };

  const handleEndDateChange = (date: Date | undefined) => {
    updateFilter('dateRange', {
      ...filters.dateRange,
      end: date || null
    });
  };

  return (
    <div className="space-y-8" 
         style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
      {/* Filter Controls Row 1: Role and Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Role Filter */}
        <div className="space-y-3">
          <Label htmlFor="role-filter" className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em]">
            Role
          </Label>
          <Select
            value={filters.role}
            onValueChange={(value) => updateFilter('role', value as UserFilter['role'])}
          >
            <SelectTrigger className="h-11 rounded-xl border-border/50 bg-background/50 
                                      focus:border-primary/50 focus:ring-2 focus:ring-primary/20 
                                      transition-all duration-300 font-[500]">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl">
              {ROLE_OPTIONS.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value}
                  className="rounded-lg font-[500] py-3 focus:bg-primary/10 focus:text-primary"
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{option.label}</span>
                    {option.value !== 'all' && roleStats[option.value] && (
                      <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-0 rounded-full">
                        {roleStats[option.value]}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="space-y-3">
          <Label htmlFor="status-filter" className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em]">
            Status
          </Label>
          <Select
            value={filters.status}
            onValueChange={(value) => updateFilter('status', value as UserFilter['status'])}
          >
            <SelectTrigger className="h-11 rounded-xl border-border/50 bg-background/50 
                                      focus:border-primary/50 focus:ring-2 focus:ring-primary/20 
                                      transition-all duration-300 font-[500]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value}
                  className="rounded-lg font-[500] py-3 focus:bg-primary/10 focus:text-primary"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Club Affiliation Filter */}
        <div className="space-y-3">
          <Label htmlFor="club-filter" className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em]">
            Club Affiliation
          </Label>
          <Input
            id="club-filter"
            placeholder="Filter by club name..."
            value={filters.clubAffiliation}
            onChange={(e) => updateFilter('clubAffiliation', e.target.value)}
            className="h-11 bg-background/50 border-border/50 rounded-xl text-base font-[500]
                       focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20
                       transition-all duration-300"
          />
        </div>

        {/* Reset Filters */}
        <div className="space-y-3">
          <Label className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em] opacity-0">
            Actions
          </Label>
          <Button
            variant="outline"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="w-full h-11 rounded-xl border-border/50 bg-background/50 font-[590]
                       hover:bg-muted/50 disabled:opacity-40 transition-all duration-300"
          >
            <X className="h-4 w-4 mr-2" />
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Filter Controls Row 2: Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Start Date */}
        <div className="space-y-3">
          <Label className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em]">
            Created After
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-[500] h-11 rounded-xl border-border/50 bg-background/50",
                  "hover:bg-muted/50 transition-all duration-300",
                  !filters.dateRange.start && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-3 h-4 w-4" />
                {filters.dateRange.start ? (
                  format(filters.dateRange.start, "PPP")
                ) : (
                  <span>Pick start date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl" align="start">
              <CalendarComponent
                mode="single"
                selected={filters.dateRange.start || undefined}
                onSelect={handleStartDateChange}
                disabled={(date) =>
                  date > new Date() || 
                  Boolean(filters.dateRange.end && date > filters.dateRange.end)
                }
                initialFocus
                className="rounded-xl"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* End Date */}
        <div className="space-y-3">
          <Label className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em]">
            Created Before
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-[500] h-11 rounded-xl border-border/50 bg-background/50",
                  "hover:bg-muted/50 transition-all duration-300",
                  !filters.dateRange.end && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-3 h-4 w-4" />
                {filters.dateRange.end ? (
                  format(filters.dateRange.end, "PPP")
                ) : (
                  <span>Pick end date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl" align="start">
              <CalendarComponent
                mode="single"
                selected={filters.dateRange.end || undefined}
                onSelect={handleEndDateChange}
                disabled={(date) =>
                  date > new Date() || 
                  Boolean(filters.dateRange.start && date < filters.dateRange.start)
                }
                initialFocus
                className="rounded-xl"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-border/30">
          <span className="text-sm font-[590] text-muted-foreground uppercase tracking-[0.02em]">
            Active filters:
          </span>
          
          {filters.role !== 'all' && (
            <Badge variant="secondary" className="gap-2 px-3 py-2 rounded-full bg-primary/10 text-primary border-0 font-[500]">
              Role: {ROLE_OPTIONS.find(r => r.value === filters.role)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-primary/20 rounded-full transition-colors duration-200"
                onClick={() => updateFilter('role', 'all')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          
          {filters.status !== 'all' && (
            <Badge variant="secondary" className="gap-2 px-3 py-2 rounded-full bg-green-500/10 text-green-700 border-0 font-[500]">
              Status: {STATUS_OPTIONS.find(s => s.value === filters.status)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-green-500/20 rounded-full transition-colors duration-200"
                onClick={() => updateFilter('status', 'all')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          
          {filters.clubAffiliation && (
            <Badge variant="secondary" className="gap-2 px-3 py-2 rounded-full bg-purple-500/10 text-purple-700 border-0 font-[500]">
              Club: {filters.clubAffiliation}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-purple-500/20 rounded-full transition-colors duration-200"
                onClick={() => updateFilter('clubAffiliation', '')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          
          {filters.dateRange.start && (
            <Badge variant="secondary" className="gap-2 px-3 py-2 rounded-full bg-blue-500/10 text-blue-700 border-0 font-[500]">
              From: {format(filters.dateRange.start, "MMM d, yyyy")}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-blue-500/20 rounded-full transition-colors duration-200"
                onClick={() => handleStartDateChange(undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          
          {filters.dateRange.end && (
            <Badge variant="secondary" className="gap-2 px-3 py-2 rounded-full bg-orange-500/10 text-orange-700 border-0 font-[500]">
              To: {format(filters.dateRange.end, "MMM d, yyyy")}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-orange-500/20 rounded-full transition-colors duration-200"
                onClick={() => handleEndDateChange(undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};