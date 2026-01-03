import React from 'react';

interface ShowSourceBadgeProps {
  source: 'myK9Show' | 'external';
}

const ShowSourceBadge: React.FC<ShowSourceBadgeProps> = ({ source }) => {
  return source === 'myK9Show' ? (
    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold mr-2">myK9Show</span>
  ) : (
    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-semibold mr-2">External Show</span>
  );
};

export default ShowSourceBadge;
