import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wifi } from 'lucide-react';

interface VenueWifiCardProps {
  showId: string;
  network: string;
  password: string;
  onSave?: (network: string, password: string) => void;
  isSaving?: boolean;
}

export function VenueWifiCard({
  network: initialNetwork,
  password: initialPassword,
  onSave,
  isSaving,
}: VenueWifiCardProps) {
  const [network, setNetwork] = useState(initialNetwork);
  const [password, setPassword] = useState(initialPassword);

  const hasChanges = network !== initialNetwork || password !== initialPassword;
  const canSave = !!onSave;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="flex items-center gap-2">
              Venue WiFi
              {!canSave && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  Coming soon
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Displayed on armband labels so exhibitors can connect on-site
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wifi-network">Network Name</Label>
            <Input
              id="wifi-network"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder="e.g. VenueWiFi"
              disabled={!canSave}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wifi-password">Password</Label>
            <Input
              id="wifi-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank if open"
              disabled={!canSave}
            />
          </div>
        </div>
        {canSave && hasChanges && (
          <Button
            size="sm"
            onClick={() => onSave(network, password)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
