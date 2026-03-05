import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { ShowCloneDialog } from '@/components/shows/cloning';
import ShowDetailsEnhanced from './ShowDetails/ShowDetailsEnhanced';
import '@/styles/myk9-show-details.css';

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
      <ShowDetailsEnhanced
        showData={showData}
        associatedTrials={associatedTrials}
        onEditShow={onEditShow}
        onDeleteShow={onDeleteShow}
        onRegisterForShow={onRegisterForShow}
        onManageEntries={() => {
          navigate(`/secretary/entries/${showData.id}`);
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
