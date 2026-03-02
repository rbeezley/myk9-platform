import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ShowCloneDialog } from '@/components/shows/cloning';
import ShowDetailsEnhancedApple from './ShowDetails/ShowDetailsEnhancedApple';
import '@/styles/apple-show-details.css';

interface ShowDetailsMainProps {
  showData: Show;
  associatedTrials: Trial[];
  onEditShow: () => void;
  onDeleteShow: () => void;
  onRegisterForShow?: (() => void) | undefined;
}

const ShowDetailsMain: React.FC<ShowDetailsMainProps> = ({
  showData,
  associatedTrials,
  onEditShow,
  onDeleteShow,
  onRegisterForShow,
}) => {
  const navigate = useNavigate();
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  return (
    <>
      <ShowDetailsEnhancedApple
        showData={showData}
        associatedTrials={associatedTrials}
        onEditShow={onEditShow}
        onDeleteShow={onDeleteShow}
        onRegisterForShow={onRegisterForShow}
        onManageEntries={() => {
          navigate('/secretary/entries', { state: { showId: showData.id } });
        }}
        onViewResults={() => {
          navigate('/results/dashboard', { state: { showId: showData.id } });
        }}
      />

      <ShowCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
    </>
  );
};

export default ShowDetailsMain;
