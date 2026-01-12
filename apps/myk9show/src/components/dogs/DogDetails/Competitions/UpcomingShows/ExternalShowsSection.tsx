import { useState } from 'react';
import AddExternalShowDialog from './AddExternalShowDialog';
import EditExternalShowDialog from './EditExternalShowDialog';
import ShowDetailsDialog, { ExternalShow } from './ShowDetailsDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import type { Competition } from '@/types/competition-types';
import { logger } from '@/services/LoggingService';

// Component state and dialog management

interface ExternalShowsSectionProps {
  shows: ExternalShow[];
  addShow: (show: Omit<ExternalShow, 'id'>) => void;
  editShow: (id: string, show: ExternalShow) => void;
  deleteShow: (id: string) => void;
}

export default function ExternalShowsSection({ shows, addShow, editShow, deleteShow }: ExternalShowsSectionProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedShow, setSelectedShow] = useState<ExternalShow | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">External Shows</h2>
        <Button
          onClick={() => {
            logger.debug('DEBUG: Add Show button clicked in ExternalShowsSection', 'dogs', {});
            setAddDialogOpen(true);
          }}
          variant="default"
        >
          + Add Show
        </Button>
      </div>
      {(shows || []).map((show, idx) => (
        <div key={show.id || idx} className="bg-muted p-5 rounded-lg border flex flex-col gap-2 relative">
          <div className="absolute top-4 right-4 z-10">
            <ThreeDotMenu
              items={[
                {
                  label: 'View Details',
                  icon: <Eye className="w-4 h-4 mr-2" />,
                  onClick: () => {
                    setSelectedShow(show);
                    setViewDialogOpen(true);
                  },
                },
                {
                  label: 'Edit',
                  icon: <Edit className="w-4 h-4 mr-2" />,
                  onClick: () => {
                    setSelectedShow(show);
                    setEditDialogOpen(true);
                  },
                },
                {
                  label: 'Delete',
                  icon: <Trash2 className="w-4 h-4 mr-2" />,
                  onClick: () => show.id && deleteShow(String(show.id)),
                  className: 'text-red-600',
                },
              ]}
            />
          </div>
          <div className="font-semibold text-base mb-1">{show.name}</div>
          <div className="text-sm mb-1">{show.startDate}</div>
          <div className="text-xs text-muted-foreground">{show.location}</div>
        </div>
      ))}
      {/* Add External Show Dialog */}
      <AddExternalShowDialog
        open={addDialogOpen}
        mode="add"
        show={null}
        onClose={() => setAddDialogOpen(false)}
        onSave={(competition: Competition) => {
          // Convert Competition to ExternalShow format
          const show = {
            name: competition.name,
            type: 'Competition',
            startDate: competition.date,
            endDate: competition.date,
            location: competition.location || '',
            status: competition.status,
            events: [],
            source: 'external' as const,
            entryOpenDate: competition.date,
            entryCloseDate: competition.date,
            preEntryFee: '$0',
            clubId: 'external',
            clubName: 'External Club',
            clubAddress: '',
            clubEmail: '',
            chairman: '',
            secretary: '',
            chiefSteward: '',
            assignedJudges: [],
            stats: [],
            trials: [],
            totalShows: 0,
            totalEntries: 0,
            totalEarnings: 0
          };
          addShow(show);
          setAddDialogOpen(false);
        }}
      />
      
      {/* Edit External Show Dialog */}
      <EditExternalShowDialog
        open={editDialogOpen}
        show={selectedShow}
        onClose={() => setEditDialogOpen(false)}
        onSave={s => {
          if (s.id) editShow(String(s.id), s);
          setEditDialogOpen(false);
        }}
      />
      
      {/* View Show Details Dialog */}
      <ShowDetailsDialog
        open={viewDialogOpen}
        show={selectedShow}
        onClose={() => setViewDialogOpen(false)}
      />
    </div>
  );
}
