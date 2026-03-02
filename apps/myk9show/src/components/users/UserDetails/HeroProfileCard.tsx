import React from 'react';
import { Camera, Mail, Phone, Dog } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { getInitials } from '@/lib/utils';
import type { User as UserType } from '@/types/dog-types';

interface HeroProfileCardProps {
  person: UserType;
  firstName: string;
  lastName: string;
  fullName: string;
  photo: string;
  phone: string;
  onEditPhoto: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const HeroProfileCard: React.FC<HeroProfileCardProps> = ({
  person,
  firstName,
  lastName,
  fullName,
  photo,
  phone,
  onEditPhoto,
  onEdit,
  onDelete,
}) => {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-card/95 to-card/80
                     myk9-subtle-card-border rounded-2xl p-8 shadow-lg backdrop-blur-xl
                     transition-all duration-500 hover:shadow-2xl hover:-translate-y-1
                     hover:border-primary/20">
      {/* Background glass effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent
                      opacity-0 hover:opacity-100 transition-opacity duration-700" />

      {/* Three dot menu */}
      <div className="absolute top-6 right-6 z-10">
        <ThreeDotMenu
          onEdit={onEdit}
          onDelete={onDelete}
          onEditPhoto={onEditPhoto}
          editLabel="Edit Person"
        />
      </div>

      {/* Hero content */}
      <div className="relative">
        <div className="flex items-start gap-8">
          {/* Enhanced Profile Photo */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={onEditPhoto}
              className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
              aria-label="Edit profile photo"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-600/20
                             rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500
                             blur-sm" />

              <Avatar className="relative w-28 h-28 border-2 border-white/20 shadow-2xl
                               group-hover:scale-105 transition-all duration-300">
                {photo && photo.trim() !== '' ? (
                  <AvatarImage src={photo} alt="Profile photo" className="object-cover" />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5
                                           text-2xl font-semibold text-primary backdrop-blur-sm">
                    {getInitials(firstName, lastName)}
                  </AvatarFallback>
                )}
              </Avatar>

              {/* Camera overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0
                             group-hover:bg-black/40 transition-all duration-300 rounded-full">
                <div className="p-3 bg-white/90 rounded-full opacity-0 group-hover:opacity-100
                               transform scale-75 group-hover:scale-100 transition-all duration-300">
                  <Camera className="w-5 h-5 text-gray-800" />
                </div>
              </div>
            </button>
          </div>

          {/* Enhanced User Info */}
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2 tracking-tight">
                {fullName}
              </h1>
              <p className="text-lg text-muted-foreground/90 font-medium tracking-wide">
                {person.email}
              </p>
            </div>

            {/* Role badges with glass effect */}
            <div className="flex flex-wrap gap-3">
              {person.roles && person.roles.length > 0 ? (
                person.roles.map((role) => (
                  <Badge key={role} className="px-4 py-2 text-sm font-medium
                                              bg-gradient-to-r from-primary/10 to-primary/5
                                              text-primary border border-primary/20
                                              backdrop-blur-sm hover:scale-105
                                              transition-all duration-200">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Badge>
                ))
              ) : (
                <Badge className="px-4 py-2 text-sm font-medium
                                bg-gradient-to-r from-muted/50 to-muted/30
                                text-muted-foreground myk9-subtle-card-border
                                backdrop-blur-sm">
                  Member
                </Badge>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              {person.email && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-2 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30
                            hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10
                            hover:border-primary/20 transition-all duration-300"
                >
                  <a href={`mailto:${person.email}`}>
                    <Mail className="w-4 h-4" />
                    Email
                  </a>
                </Button>
              )}
              {phone && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-2 bg-gradient-to-r from-muted/50 to-muted/30 border-border/30
                            hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10
                            hover:border-primary/20 transition-all duration-300"
                >
                  <a href={`tel:${phone.replace(/[^\d]/g, '')}`}>
                    <Phone className="w-4 h-4" />
                    Call
                  </a>
                </Button>
              )}
              {person.dogs && person.dogs.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                              bg-gradient-to-r from-muted/30 to-muted/20 text-sm text-muted-foreground">
                  <Dog className="w-4 h-4" />
                  <span>{person.dogs.length} dog{person.dogs.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default HeroProfileCard;
