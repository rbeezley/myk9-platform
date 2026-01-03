import React from 'react';

interface ClubInfoProps {
  name: string;
  description: string;
  founded?: string;
  location?: string;
}

const ClubInfo: React.FC<ClubInfoProps> = ({ name, description, founded, location }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold mb-2">{name}</h2>
    <p className="text-gray-700 mb-2">{description}</p>
    {founded && <div className="text-sm text-muted-foreground mb-1">Founded: {founded}</div>}
    {location && <div className="text-sm text-muted-foreground">Location: {location}</div>}
  </div>
);

export default ClubInfo;
