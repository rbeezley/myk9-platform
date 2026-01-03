import React from 'react';
import ShowCard, { Show } from './ShowCard';

export interface ShowsListProps {
  shows: Show[];
  actionText: string;
  onAction: (show: Show) => void;
  emptyMessage?: string;
}

const ShowsList: React.FC<ShowsListProps> = ({ shows, actionText, onAction, emptyMessage }) => {
  if (!shows.length && emptyMessage) {
    return <div className="text-gray-500 text-center py-8">{emptyMessage}</div>;
  }
  return (
    <div className="space-y-4">
      {shows.map(show => (
        <ShowCard
          key={show.id}
          show={show}
          actionText={actionText}
          onAction={() => onAction(show)}
        />
      ))}
    </div>
  );
};

export default ShowsList;
