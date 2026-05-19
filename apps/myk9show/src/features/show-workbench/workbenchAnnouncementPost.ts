import { toast } from 'sonner';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useAnnouncementStore } from '@/store/announcementStore';
import { getAnnouncementAuthor } from '@/types/announcement-types';
import type { AnnouncementPriority } from '@/types/announcement-types';

export interface WorkbenchAnnouncementInput {
  showId: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  expiresAt: string;
  successMessage: string;
  errorMessage: string;
  undoSuccessMessage: string;
  undoErrorMessage: string;
  onPosted?: () => void;
}

export function useWorkbenchAnnouncementPost() {
  const { user, userWithRoles } = useAuthContext();
  const createAnnouncement = useAnnouncementStore(s => s.createAnnouncement);
  const deleteAnnouncement = useAnnouncementStore(s => s.deleteAnnouncement);
  const author = getAnnouncementAuthor(user, userWithRoles, 'Secretary');

  async function postAnnouncement(input: WorkbenchAnnouncementInput): Promise<boolean> {
    if (!author.id) {
      toast.error('Hang on — still loading your account');
      return false;
    }

    try {
      const announcement = await createAnnouncement(
        {
          show_id: input.showId,
          title: input.title,
          content: input.content,
          priority: input.priority,
          expires_at: input.expiresAt,
        },
        author.id,
        author.role,
        author.name
      );

      toast.success(input.successMessage, {
        action: {
          label: 'Undo',
          onClick: () => {
            void deleteAnnouncement(announcement.id)
              .then(() => toast.success(input.undoSuccessMessage))
              .catch(() => toast.error(input.undoErrorMessage));
          },
        },
      });
      input.onPosted?.();
      return true;
    } catch {
      toast.error(input.errorMessage);
      return false;
    }
  }

  return { postAnnouncement };
}
