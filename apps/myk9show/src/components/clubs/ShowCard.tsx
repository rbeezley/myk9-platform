import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin } from 'lucide-react';

export interface Show {
  id: number;
  name: string;
  date: string;
  location: string;
  description: string;
  image: string;
}

export interface ShowCardProps {
  show: Show;
  actionText: string;
  onAction: () => void;
}

const ShowCard: React.FC<ShowCardProps> = ({ show, actionText, onAction }) => (
  <Card className="p-4 hover:bg-gray-50">
    <div className="flex items-center">
      <div className="w-16 h-16 rounded-lg overflow-hidden mr-4">
        <img
          src={show.image}
          alt={show.name}
          className="w-full h-full object-cover object-top"
        />
      </div>
      <div className="flex-grow">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold">{show.name}</h3>
            <p className="text-sm text-gray-500 line-clamp-2">{show.description}</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="!rounded-button whitespace-nowrap cursor-pointer"
            onClick={onAction}
          >
            {actionText}
          </Button>
        </div>
        <div className="flex items-center mt-2 text-sm text-gray-500">
          <span className="flex items-center mr-4">
            <Calendar className="h-4 w-4 mr-2" />
            {show.date}
          </span>
          <span className="flex items-center">
            <MapPin className="h-4 w-4 mr-2" />
            {show.location}
          </span>
        </div>
      </div>
    </div>
  </Card>
);

export default ShowCard;
