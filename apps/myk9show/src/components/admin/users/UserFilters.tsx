/**
 * UserFilters - filtering controls for user management.
 *
 * Every control here filters something the roster query actually returns
 * (role, account status, created date, deleted rows). A "club affiliation"
 * input used to sit alongside these; `get_admin_user_list` returns no club
 * data, so it matched on names instead and was removed rather than faked.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { X, Calendar, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

import { UserFilter } from '@/pages/admin/UserManagementPage';
import { DEFAULT_USER_FILTER } from '@/pages/admin/UserManagementPage.types';

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
  { value: 'suspended', label: 'Suspended' },
] as const;

const FIELD_CLASS =
  'h-11 rounded-xl border-border bg-background focus:border-primary focus:ring-2 focus:ring-ring transition-colors';

const LABEL_CLASS = 'text-sm font-medium text-muted-foreground';

/** Chips speak the warm --chip-* pairs; each pair ships an AA-safe fg on its bg. */
const CHIP_BLUE = 'bg-[color:var(--chip-blue-bg)] text-[color:var(--chip-blue-fg)]';
const CHIP_GREEN = 'bg-[color:var(--chip-green-bg)] text-[color:var(--chip-green-fg)]';
const CHIP_STONE = 'bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)]';

/**
 * Dismiss control inside a chip. 24px visually; `box-content` plus 10px of
 * padding makes the hit area exactly 44px, and the matching negative margin
 * keeps the chip itself from growing around it.
 */
const CHIP_DISMISS_CLASS =
  'h-6 w-6 -m-2.5 box-content p-2.5 rounded-full hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring';

export const UserFilters: React.FC<UserFiltersProps> = ({
  filters,
  onFiltersChange,
  roleStats,
}) => {
  // Update individual filter values
  const updateFilter = <K extends keyof UserFilter>(key: K, value: UserFilter[K]) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  // Reset all filters
  const resetFilters = () => {
    onFiltersChange(DEFAULT_USER_FILTER);
  };

  // Check if any filters are active
  const hasActiveFilters =
    filters.role !== 'all' ||
    filters.status !== 'all' ||
    filters.showDeleted ||
    filters.dateRange.start !== null ||
    filters.dateRange.end !== null;

  // Handle date range changes
  const handleStartDateChange = (date: Date | undefined) => {
    updateFilter('dateRange', {
      ...filters.dateRange,
      start: date || null,
    });
  };

  const handleEndDateChange = (date: Date | undefined) => {
    updateFilter('dateRange', {
      ...filters.dateRange,
      end: date || null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Role and status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role-filter" className={LABEL_CLASS}>
            Role
          </Label>
          <Select
            value={filters.role}
            onValueChange={value => updateFilter('role', value as UserFilter['role'])}
          >
            <SelectTrigger id="role-filter" className={FIELD_CLASS}>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-popover shadow-lg">
              {ROLE_OPTIONS.map(option => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-lg py-3 focus:bg-primary/10 focus:text-primary"
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{option.label}</span>
                    {option.value !== 'all' && roleStats[option.value] && (
                      <Badge
                        variant="secondary"
                        className="ml-2 bg-primary/10 text-primary border-0 rounded-full"
                      >
                        {roleStats[option.value]}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status-filter" className={LABEL_CLASS}>
            Status
          </Label>
          <Select
            value={filters.status}
            onValueChange={value => updateFilter('status', value as UserFilter['status'])}
          >
            <SelectTrigger id="status-filter" className={FIELD_CLASS}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-popover shadow-lg">
              {STATUS_OPTIONS.map(option => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-lg py-3 focus:bg-primary/10 focus:text-primary"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Created after */}
        <div className="space-y-2">
          <Label htmlFor="created-after" className={LABEL_CLASS}>
            Created after
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="created-after"
                variant="outline"
                className={cn(
                  'w-full justify-start text-left',
                  FIELD_CLASS,
                  !filters.dateRange.start && 'text-muted-foreground'
                )}
              >
                <Calendar className="mr-3 h-4 w-4" />
                {filters.dateRange.start ? (
                  format(filters.dateRange.start, 'PPP')
                ) : (
                  <span>Pick a start date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 rounded-xl border-border bg-popover shadow-lg"
              align="start"
            >
              <CalendarComponent
                mode="single"
                selected={filters.dateRange.start || undefined}
                onSelect={handleStartDateChange}
                disabled={date =>
                  date > new Date() ||
                  Boolean(filters.dateRange.end && date > filters.dateRange.end)
                }
                initialFocus
                className="rounded-xl"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Created before */}
        <div className="space-y-2">
          <Label htmlFor="created-before" className={LABEL_CLASS}>
            Created before
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="created-before"
                variant="outline"
                className={cn(
                  'w-full justify-start text-left',
                  FIELD_CLASS,
                  !filters.dateRange.end && 'text-muted-foreground'
                )}
              >
                <Calendar className="mr-3 h-4 w-4" />
                {filters.dateRange.end ? (
                  format(filters.dateRange.end, 'PPP')
                ) : (
                  <span>Pick an end date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 rounded-xl border-border bg-popover shadow-lg"
              align="start"
            >
              <CalendarComponent
                mode="single"
                selected={filters.dateRange.end || undefined}
                onSelect={handleEndDateChange}
                disabled={date =>
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

      {/* Deleted rows + reset */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 min-h-11 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showDeleted}
            onChange={e => updateFilter('showDeleted', e.target.checked)}
            className="h-5 w-5 rounded border-input accent-primary cursor-pointer"
          />
          Include removed users
        </label>
        {filters.showDeleted && (
          // Removed people can be restored from the rows above; this is the
          // cross-entity sweep (dogs, shows, clubs) the roster can't cover.
          <Link
            to="/admin/deleted-items"
            className="inline-flex items-center gap-1.5 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            All deleted items
          </Link>
        )}
        </div>
        <Button
          variant="outline"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          className="h-11 rounded-xl disabled:opacity-40"
        >
          <X className="h-4 w-4 mr-2" />
          Reset filters
        </Button>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
          <span className="text-sm font-medium text-muted-foreground">Active filters:</span>

          {filters.role !== 'all' && (
            <Badge
              variant="secondary"
              className={cn('gap-2 px-3 py-2 rounded-full border-0', CHIP_BLUE)}
            >
              Role: {ROLE_OPTIONS.find(r => r.value === filters.role)?.label}
              <Button
                variant="ghost"
                aria-label="Clear role filter"
                className={CHIP_DISMISS_CLASS}
                onClick={() => updateFilter('role', 'all')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </Badge>
          )}

          {filters.status !== 'all' && (
            <Badge
              variant="secondary"
              className={cn('gap-2 px-3 py-2 rounded-full border-0', CHIP_GREEN)}
            >
              Status: {STATUS_OPTIONS.find(s => s.value === filters.status)?.label}
              <Button
                variant="ghost"
                aria-label="Clear status filter"
                className={CHIP_DISMISS_CLASS}
                onClick={() => updateFilter('status', 'all')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </Badge>
          )}

          {filters.showDeleted && (
            <Badge
              variant="secondary"
              className={cn('gap-2 px-3 py-2 rounded-full border-0', CHIP_STONE)}
            >
              Including removed users
              <Button
                variant="ghost"
                aria-label="Stop including removed users"
                className={CHIP_DISMISS_CLASS}
                onClick={() => updateFilter('showDeleted', false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </Badge>
          )}

          {filters.dateRange.start && (
            <Badge
              variant="secondary"
              className={cn('gap-2 px-3 py-2 rounded-full border-0', CHIP_STONE)}
            >
              From: {format(filters.dateRange.start, 'MMM d, yyyy')}
              <Button
                variant="ghost"
                aria-label="Clear created-after filter"
                className={CHIP_DISMISS_CLASS}
                onClick={() => handleStartDateChange(undefined)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </Badge>
          )}

          {filters.dateRange.end && (
            <Badge
              variant="secondary"
              className={cn('gap-2 px-3 py-2 rounded-full border-0', CHIP_STONE)}
            >
              To: {format(filters.dateRange.end, 'MMM d, yyyy')}
              <Button
                variant="ghost"
                aria-label="Clear created-before filter"
                className={CHIP_DISMISS_CLASS}
                onClick={() => handleEndDateChange(undefined)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};
