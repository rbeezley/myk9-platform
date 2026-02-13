import React from 'react';
import {
  Camera,
  Activity,
  Clock,
  Award,
  Heart,
  Sparkles,
  Star,
  Smile,
  PawPrint,
} from 'lucide-react';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { formatDisplayDate } from './utils';
import type { HeroProfileCardProps } from './types';

const HeroProfileCard: React.FC<HeroProfileCardProps> = ({
  dog,
  showCelebration,
  recentUpdate,
  isPhotoHovered,
  onEditPanelOpen,
  onPhotoDialogOpen,
  onDeleteDialogOpen,
}) => {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-card/95 to-card/80
                   apple-subtle-card-border rounded-2xl p-8 shadow-lg backdrop-blur-xl
                   transition-all duration-500 hover:shadow-2xl hover:-translate-y-1
                   hover:border-primary/20">
      {/* Background glass effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent
                      opacity-0 hover:opacity-100 transition-opacity duration-700" />

      {/* Three dot menu */}
      <div className="absolute top-6 right-6 z-10">
        <ThreeDotMenu
          onEdit={onEditPanelOpen}
          onEditPhoto={onPhotoDialogOpen}
          onDelete={onDeleteDialogOpen}
          editLabel="Edit Dog"
        />
      </div>

      {/* Hero content */}
      <div className="relative">
        <div className="flex items-start gap-8">
          {/* Enhanced Profile Photo */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={onPhotoDialogOpen}
              className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
              aria-label="Edit dog photo"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-600/20
                             rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500
                             blur-sm" />

              <Avatar className="relative w-28 h-28 border-2 border-white/20 shadow-2xl
                               group-hover:scale-105 transition-all duration-300">
                {dog.imageUrl ? (
                  <AvatarImage
                    src={dog.imageUrl}
                    alt={`${dog.callName}'s photo`}
                    className="object-cover"
                  />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5
                                           text-2xl font-semibold text-primary backdrop-blur-sm">
                    {getInitials(dog.callName)}
                  </AvatarFallback>
                )}
              </Avatar>

              {/* Playful paw prints on hover */}
              {isPhotoHovered && (
                <div className="absolute -top-2 -right-2 animate-bounce">
                  <PawPrint className="w-4 h-4 text-primary/60" />
                </div>
              )}

              {/* Camera overlay with heart */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0
                             group-hover:bg-black/40 transition-all duration-300 rounded-full">
                <div className="p-3 bg-white/90 rounded-full opacity-0 group-hover:opacity-100
                               transform scale-75 group-hover:scale-100 transition-all duration-300">
                  <div className="relative">
                    <Camera className="w-5 h-5 text-gray-800" />
                    <Heart className="w-2 h-2 text-pink-500 absolute -top-1 -right-1 fill-current" />
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Enhanced Dog Info */}
          <div className="flex-1 space-y-4">
            <div className="relative">
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-bold text-foreground mb-2 tracking-tight">
                  {dog.callName}
                </h1>
                {/* Celebration sparkles */}
                {showCelebration && (
                  <div className="flex gap-1 animate-bounce">
                    <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
                    <Star className="w-5 h-5 text-yellow-400 animate-spin" />
                  </div>
                )}
              </div>
              {/* Recent update celebration */}
              {recentUpdate && (
                <div className="absolute -top-2 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500
                               text-white px-3 py-1 rounded-full text-xs font-medium animate-pulse">
                  <Smile className="w-3 h-3 inline mr-1" />
                  {recentUpdate}
                </div>
              )}
              <p className="text-lg text-foreground font-medium tracking-wide">
                {(() => {
                  if (!dog.registrations || dog.registrations.length === 0) {
                    return 'No breed registered';
                  }

                  // Get unique breeds from all registrations
                  const breeds = Array.from(new Set(
                    dog.registrations.map(reg => reg.breed).filter(Boolean)
                  ));

                  if (breeds.length === 0) {
                    return 'Breed not specified';
                  }

                  return breeds.join(', ');
                })()}
              </p>
            </div>

            {/* Status badges with glass effect */}
            <div className="flex flex-wrap gap-3">
              {dog.gender && (
                <Badge className="px-4 py-2 text-sm font-medium
                               bg-gradient-to-r from-primary/10 to-primary/5
                               text-primary border border-primary/20
                               backdrop-blur-sm hover:scale-105
                               transition-all duration-200">
                  <Activity className="w-3 h-3 mr-2" />
                  {dog.gender.charAt(0).toUpperCase() + dog.gender.slice(1)}
                </Badge>
              )}
              {dog.dateOfBirth && (
                <Badge className="px-4 py-2 text-sm font-medium
                               bg-gradient-to-r from-emerald-500/10 to-emerald-500/5
                               text-emerald-600 dark:text-emerald-400 border border-emerald-500/20
                               backdrop-blur-sm hover:scale-105
                               transition-all duration-200">
                  <Clock className="w-3 h-3 mr-2" />
                  Born {formatDisplayDate(dog.dateOfBirth)}
                </Badge>
              )}
              {dog.registrations && dog.registrations.length > 0 && (
                <Badge className="px-4 py-2 text-sm font-medium
                               bg-gradient-to-r from-purple-500/10 to-purple-500/5
                               text-purple-600 dark:text-purple-400 border border-purple-500/20
                               backdrop-blur-sm hover:scale-105
                               transition-all duration-200">
                  <Award className="w-3 h-3 mr-2" />
                  {dog.registrations.length} Registration{dog.registrations.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default HeroProfileCard;
