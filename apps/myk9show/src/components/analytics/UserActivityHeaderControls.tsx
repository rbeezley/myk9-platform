import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Users,
  Download
} from 'lucide-react';

interface UserActivityHeaderControlsProps {
  userFilter: string;
  setUserFilter: (value: string) => void;
  deviceFilter: string;
  setDeviceFilter: (value: string) => void;
  isRealTimeEnabled: boolean;
  setIsRealTimeEnabled: (value: boolean) => void;
  onExport: () => void;
}

export function UserActivityHeaderControls({
  userFilter,
  setUserFilter,
  deviceFilter,
  setDeviceFilter,
  isRealTimeEnabled,
  setIsRealTimeEnabled,
  onExport
}: UserActivityHeaderControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          User Activity Monitor
        </h2>
        <p className="text-muted-foreground">Real-time user behavior and engagement analytics</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="Judge">Judges</SelectItem>
            <SelectItem value="Secretary">Secretaries</SelectItem>
            <SelectItem value="Exhibitor">Exhibitors</SelectItem>
            <SelectItem value="Admin">Admins</SelectItem>
          </SelectContent>
        </Select>

        <Select value={deviceFilter} onValueChange={setDeviceFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="tablet">Tablet</SelectItem>
            <SelectItem value="desktop">Desktop</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            checked={isRealTimeEnabled}
            onCheckedChange={setIsRealTimeEnabled}
          />
          <span className="text-sm text-muted-foreground">Live</span>
        </div>

        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  );
}
