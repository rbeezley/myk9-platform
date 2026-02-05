/**
 * Profile Header Component
 *
 * Displays the exhibitor's avatar, name, email, and subscription tier
 */

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Crown, Sparkles } from 'lucide-react';
import { ImageUpload } from '@/components/ui/image-upload';
import { uploadProfilePhoto } from '@/services/imageUploadService';
import { getInitials } from '@/lib/utils';
import { logger } from '@/services/LoggingService';
import type { PersonData } from './types';

interface ProfileHeaderProps {
  person: PersonData | undefined;
  subscriptionTier: string;
  userId: string;
  onUpdateProfileImage: (url: string) => Promise<void>;
}

export function ProfileHeader({
  person,
  subscriptionTier,
  userId,
  onUpdateProfileImage,
}: ProfileHeaderProps) {
  const handlePhotoUpload = async (file: File) => {
    const result = await uploadProfilePhoto(userId, file);
    if (result.success && result.url) {
      try {
        await onUpdateProfileImage(result.url);
      } catch (error) {
        logger.error(
          'Failed to save profile image to database',
          'exhibitor-profile',
          undefined,
          error as Error
        );
        return { success: false, error: 'Failed to save image. Please try again.' };
      }
    }
    return result;
  };

  return (
    <Card className="border border-border rounded-2xl shadow-sm mb-6">
      <CardContent className="pt-6 pb-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <ImageUpload
            currentImage={person?.profile_image}
            fallback={
              <span className="text-3xl font-semibold text-muted-foreground">
                {getInitials(person?.first_name, person?.last_name)}
              </span>
            }
            size="lg"
            onUpload={handlePhotoUpload}
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">
              {person?.first_name} {person?.last_name}
            </h1>
            <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2 mb-3">
              <Mail className="h-4 w-4" />
              {person?.email}
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              {subscriptionTier === 'free' ? (
                <>
                  <Badge variant="secondary">Free Member</Badge>
                  <Button size="sm" className="gap-1.5 h-7">
                    <Sparkles className="h-3.5 w-3.5" />
                    Upgrade to Premium
                  </Button>
                </>
              ) : (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  <Crown className="h-3 w-3 mr-1" />
                  Premium Member
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
