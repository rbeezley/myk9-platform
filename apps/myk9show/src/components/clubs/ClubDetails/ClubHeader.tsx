import React from 'react';
import { MapPin, Mail, Phone, Globe, Award, Shield, MoreVertical, Edit, Trash2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Club } from '@/types/club-types';
import { getClubInitials } from './utils';

interface ClubHeaderProps {
  club: Club;
  onEditClub: () => void;
  onEditPhoto: () => void;
  onDeleteClub: () => void;
}

export const ClubHeader: React.FC<ClubHeaderProps> = ({
  club,
  onEditClub,
  onEditPhoto,
  onDeleteClub,
}) => {
  return (
    <div className="mb-10 p-8 bg-card border border-border rounded-2xl relative">
      {/* 3-dot menu positioned absolutely in top-right corner */}
      <div className="absolute top-4 right-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 p-0" aria-label="Club options">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEditClub}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Club
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEditPhoto}>
              <Camera className="mr-2 h-4 w-4" />
              Change Photo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.open(`mailto:${club.email}`, '_self')}>
              <Mail className="mr-2 h-4 w-4" />
              Email Club
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`tel:${club.phone}`, '_self')}>
              <Phone className="mr-2 h-4 w-4" />
              Call Club
            </DropdownMenuItem>
            {club.website && (
              <DropdownMenuItem onClick={() => window.open(
                club.website?.startsWith('http') ? club.website : `https://${club.website}`,
                '_blank',
                'noopener,noreferrer'
              )}>
                <Globe className="mr-2 h-4 w-4" />
                Visit Website
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDeleteClub} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Club
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Club content layout */}
      <div className="flex flex-col md:flex-row items-center gap-6">
        {club.logo ? (
          <img
            src={club.logo}
            alt={club.name}
            className="w-32 h-32 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
            onClick={onEditPhoto}
            title="Click to edit club logo"
          />
        ) : (
          <div
            className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors"
            onClick={onEditPhoto}
            title="Click to add club logo"
          >
            <span className="text-3xl font-bold text-primary">
              {getClubInitials(club.name)}
            </span>
          </div>
        )}
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-foreground mb-2">{club.name}</h1>
          {(club.address?.city || club.address?.state) && (
            <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mb-2">
              <MapPin className="w-4 h-4" />
              {[club.address?.city, club.address?.state].filter(Boolean).join(', ')}
            </div>
          )}
          {club.clubNumber && (
            <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mb-4">
              <Shield className="w-4 h-4" />
              Club #{club.clubNumber}
            </div>
          )}
          <div className="flex gap-2 flex-wrap justify-center md:justify-start">
            {club.clubType && (
              <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                <Award className="w-3 h-3" />
                {club.clubType.charAt(0).toUpperCase() + club.clubType.slice(1)} Club
              </div>
            )}
            {club.founded && (
              <div className="flex items-center gap-1 px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-xs font-medium">
                <Shield className="w-3 h-3" />
                Founded {club.founded instanceof Date
                  ? club.founded.getFullYear()
                  : new Date(club.founded).getFullYear()}
              </div>
            )}
          </div>
          {/* Quick contact actions */}
          {(club.email || club.phone) && (
            <div className="flex gap-2 mt-4 justify-center md:justify-start">
              {club.email && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => window.open(`mailto:${club.email}`, '_self')}
                  title={`Email: ${club.email}`}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              )}
              {club.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => window.open(`tel:${club.phone}`, '_self')}
                  title={`Call: ${club.phone}`}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
