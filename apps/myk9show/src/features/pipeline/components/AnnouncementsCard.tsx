import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { getAnnouncementAuthor } from '@/types/announcement-types';
import type { ShowAnnouncement } from '@/types/announcement-types';

interface AnnouncementsCardProps {
  showId: string;
  showEndDate?: string | null;
}

export function AnnouncementsCard({ showId, showEndDate }: AnnouncementsCardProps) {
  const announcements = useAnnouncementStore(s => s.announcements);
  const unreadCount = useAnnouncementStore(s => s.unreadCount);
  const markRead = useAnnouncementStore(s => s.markRead);
  const deleteAnnouncement = useAnnouncementStore(s => s.deleteAnnouncement);
  const { userWithRoles } = useAuthContext();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ShowAnnouncement | null>(null);

  const author = getAnnouncementAuthor(null, userWithRoles);

  const showAnnouncements = announcements.filter(a => a.show_id === showId);

  const canEditOrDelete = (ann: ShowAnnouncement) =>
    ann.author_id === author.id || author.role === 'secretary';

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncement(id);
      notifications.success('Announcement deleted');
    } catch {
      notifications.error('Failed to delete announcement');
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Announcements</h3>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-500 px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        {author.isOfficial && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCreateOpen(true)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3 w-3" />
            New
          </Button>
        )}
      </div>

      {/* List */}
      <div className="max-h-64 overflow-y-auto">
        {showAnnouncements.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Megaphone className="mb-2 h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No announcements yet</p>
          </div>
        ) : (
          showAnnouncements.map(ann => {
            const canEdit = canEditOrDelete(ann);
            return (
              <AnnouncementItem
                key={ann.id}
                announcement={ann}
                onMarkRead={id => {
                  void markRead(id, author.id);
                }}
                {...(canEdit
                  ? {
                      onEdit: () => setEditingAnnouncement(ann),
                      onDelete: handleDelete,
                      showActions: true,
                    }
                  : {})}
              />
            );
          })
        )}
      </div>

      {/* Create dialog */}
      <CreateAnnouncementDialog
        isOpen={isCreateOpen || !!editingAnnouncement}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingAnnouncement(null);
        }}
        showId={showId}
        {...(showEndDate != null ? { showEndDate } : {})}
        authorId={author.id}
        authorRole={author.role}
        authorName={author.name}
      />
    </div>
  );
}
