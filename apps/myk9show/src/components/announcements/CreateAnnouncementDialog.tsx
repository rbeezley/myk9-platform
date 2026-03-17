import { useState } from 'react';
import { X, Megaphone, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Textarea } from '@/components/ui/textarea';
import { useAnnouncementStore } from '@/store/announcementStore';
import { notifications } from '@/lib/notifications';
import type { AnnouncementPriority, AnnouncementAuthorRole } from '@/types/announcement-types';

const PRIORITY_OPTIONS: {
  value: AnnouncementPriority;
  label: string;
  icon: typeof Megaphone;
  className: string;
}[] = [
  {
    value: 'normal',
    label: 'Normal',
    icon: Megaphone,
    className: 'border-purple-500/30 text-purple-400',
  },
  {
    value: 'high',
    label: 'High',
    icon: AlertTriangle,
    className: 'border-amber-500/30 text-amber-400',
  },
  {
    value: 'urgent',
    label: 'Urgent',
    icon: AlertCircle,
    className: 'border-red-500/30 text-red-400',
  },
];

interface CreateAnnouncementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showId: string;
  showEndDate?: string | null;
  authorId: string;
  authorRole: AnnouncementAuthorRole;
  authorName: string;
}

export function CreateAnnouncementDialog({
  isOpen,
  onClose,
  showId,
  showEndDate,
  authorId,
  authorRole,
  authorName,
}: CreateAnnouncementDialogProps) {
  const createAnnouncement = useAnnouncementStore(s => s.createAnnouncement);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [expiresAt, setExpiresAt] = useState(showEndDate?.slice(0, 16) ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setPriority('normal');
    setExpiresAt(showEndDate?.slice(0, 16) ?? '');
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await createAnnouncement(
        {
          show_id: showId,
          title: title.trim(),
          content: content.trim(),
          priority,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
        authorId,
        authorRole,
        authorName
      );
      notifications.success('Announcement posted');
      resetForm();
      onClose();
    } catch {
      notifications.error('Failed to post announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Create Announcement"
        aria-modal="true"
        className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-xl border border-border/50 bg-popover p-6 shadow-2xl sm:inset-x-auto"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Announcement</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" fieldId="ann-title" required>
            <Input
              id="ann-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Gate 3 moved to Ring B"
              required
              maxLength={200}
            />
          </FormField>

          <FormField label="Message" fieldId="ann-content" required>
            <Textarea
              id="ann-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Details about the announcement..."
              required
              rows={3}
              maxLength={2000}
            />
          </FormField>

          <div>
            <Label>Priority</Label>
            <div className="mt-1.5 flex gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                    priority === opt.value
                      ? `${opt.className} bg-muted/30`
                      : 'border-border/30 text-muted-foreground hover:border-border'
                  }`}
                  aria-pressed={priority === opt.value}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <FormField label="Expires at (optional)" fieldId="ann-expires" hint="Defaults to show end date. Clear to keep indefinitely.">
            <Input
              id="ann-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()}>
              {isSubmitting ? 'Posting...' : 'Post Announcement'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
