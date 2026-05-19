import { useState } from 'react';
import { Megaphone, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_QUICK_BROADCAST_TEMPLATE,
  QUICK_BROADCAST_PRIORITY,
  QUICK_BROADCAST_TEMPLATES,
  buildQuickBroadcastExpiresAt,
  getQuickBroadcastTemplate,
} from './quickBroadcast';
import { useWorkbenchAnnouncementPost } from './workbenchAnnouncementPost';

interface QuickBroadcastCardProps {
  showId: string;
}

export function QuickBroadcastCard({ showId }: QuickBroadcastCardProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    DEFAULT_QUICK_BROADCAST_TEMPLATE.id
  );
  const [title, setTitle] = useState(DEFAULT_QUICK_BROADCAST_TEMPLATE.title);
  const [message, setMessage] = useState(DEFAULT_QUICK_BROADCAST_TEMPLATE.content);
  const [isPosting, setIsPosting] = useState(false);
  const { postAnnouncement } = useWorkbenchAnnouncementPost();

  function selectTemplate(templateId: string) {
    const template = getQuickBroadcastTemplate(templateId);
    setSelectedTemplateId(template.id);
    setTitle(template.title);
    setMessage(template.content);
  }

  function reset() {
    selectTemplate(DEFAULT_QUICK_BROADCAST_TEMPLATE.id);
  }

  async function handlePost() {
    if (!title.trim() || !message.trim()) {
      toast.error('Add a title and message before posting');
      return;
    }

    setIsPosting(true);
    try {
      await postAnnouncement({
        showId,
        title: title.trim(),
        content: message.trim(),
        priority: QUICK_BROADCAST_PRIORITY,
        expiresAt: buildQuickBroadcastExpiresAt(),
        successMessage: 'Broadcast posted',
        errorMessage: 'Could not post broadcast',
        undoSuccessMessage: 'Broadcast removed',
        undoErrorMessage: 'Could not remove broadcast',
        onPosted: reset,
      });
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="quick-broadcast-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="quick-broadcast-title" className="text-base font-semibold">
            Quick broadcast
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Canned show-wide announcements for common desk updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handlePost} disabled={isPosting}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {isPosting ? 'Posting...' : 'Post broadcast'}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_BROADCAST_TEMPLATES.map(template => (
          <Button
            key={template.id}
            type="button"
            variant={selectedTemplateId === template.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => selectTemplate(template.id)}
          >
            <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
            {template.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-broadcast-title-input">Title</Label>
          <Input
            id="quick-broadcast-title-input"
            value={title}
            onChange={event => setTitle(event.target.value)}
            maxLength={200}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="quick-broadcast-message">Message</Label>
          <Textarea
            id="quick-broadcast-message"
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>
    </section>
  );
}
