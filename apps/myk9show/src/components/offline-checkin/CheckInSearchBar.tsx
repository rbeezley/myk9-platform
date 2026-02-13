import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { CheckInStatus } from '@/types/check-in-types';

interface CheckInSearchBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: CheckInStatus | 'all';
  onStatusFilterChange: (value: CheckInStatus | 'all') => void;
}

export const CheckInSearchBar: React.FC<CheckInSearchBarProps> = ({
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
}) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by dog name, handler, or armband..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as CheckInStatus | 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="none">Not Checked In</SelectItem>
              <SelectItem value="checked-in">Checked In</SelectItem>
              <SelectItem value="at-gate">At Gate</SelectItem>
              <SelectItem value="go-to-gate">Go to Gate</SelectItem>
              <SelectItem value="conflict">Conflict</SelectItem>
              <SelectItem value="pulled">Pulled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
