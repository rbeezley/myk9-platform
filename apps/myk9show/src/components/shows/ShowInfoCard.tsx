import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useResolvePersonName } from '@/hooks/useResolvePersonName';

interface ShowInfoCardProps {
  showData: {
    name: string;
    status: string;
    type: string;
    startDate: Date;
    endDate: Date;
    chairman: string;
    secretary: string;
    chiefSteward: string;
    entryOpenDate: Date;
    entryCloseDate: Date;
    preEntryFee: string;
    // add other fields as needed
  };
}

const ShowInfoCard: React.FC<ShowInfoCardProps> = ({ showData }) => {
  const resolvePersonName = useResolvePersonName();

  return (
    <Card className="mb-8 p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold">{showData.name}</h2>
        <Badge variant="secondary">{showData.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Show Type</div>
          <div className="font-medium">{showData.type}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Dates</div>
          <div className="font-medium">{new Date(showData.startDate).toLocaleDateString()} - {new Date(showData.endDate).toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Chairman</div>
          <div className="font-medium">{resolvePersonName(showData.chairman)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Secretary</div>
          <div className="font-medium">{resolvePersonName(showData.secretary)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Chief Steward</div>
          <div className="font-medium">{resolvePersonName(showData.chiefSteward)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Entry Open</div>
          <div className="font-medium">{showData.entryOpenDate.toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Entry Close</div>
          <div className="font-medium">{showData.entryCloseDate.toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1 font-semibold">Pre-Entry Fee</div>
          <div className="font-medium">{showData.preEntryFee}</div>
        </div>
      </div>
    </Card>
  );
};

export default ShowInfoCard;
