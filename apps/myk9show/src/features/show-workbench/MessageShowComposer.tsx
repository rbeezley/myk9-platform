import { useMemo, useState } from 'react';
import { History, Megaphone, RotateCcw, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import {
  DEFAULT_MESSAGE_SHOW_TEMPLATE,
  MESSAGE_SHOW_TEMPLATES,
  buildMessageShowAnnouncementExpiresAt,
  buildMessageShowDraft,
  getMessageShowDeliveryLane,
  type MessageShowClassOption,
  type MessageShowRecipientType,
  type MessageShowTemplateId,
} from './messageShow';
import { WorkbenchPushAlertToggle } from './WorkbenchPushAlertToggle';
import { getWorkbenchAnnouncementPriority } from './workbenchAnnouncementPriority';
import { useWorkbenchAnnouncementPost } from './workbenchAnnouncementPost';

interface MessageShowComposerProps {
  showId: string;
  classes: MessageShowClassOption[];
  onSent?: () => void;
  showHistoryLink?: boolean;
}

const RECIPIENT_LABELS: Record<MessageShowRecipientType, string> = {
  all_show: 'Everyone in show',
  class: 'A class',
  checked_in: 'Everyone checked in',
};

function entryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

export function MessageShowComposer({
  showId,
  classes,
  onSent,
  showHistoryLink = true,
}: MessageShowComposerProps) {
  const [recipient, setRecipient] = useState<MessageShowRecipientType>('all_show');
  const [selectedTemplateId, setSelectedTemplateId] = useState<MessageShowTemplateId>(
    DEFAULT_MESSAGE_SHOW_TEMPLATE.id
  );
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '');
  const initialDraft = buildMessageShowDraft(DEFAULT_MESSAGE_SHOW_TEMPLATE.id, classes[0]?.label);
  const [title, setTitle] = useState(initialDraft.title);
  const [message, setMessage] = useState(initialDraft.body);
  const [sendPushAlert, setSendPushAlert] = useState(true);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const { postAnnouncement } = useWorkbenchAnnouncementPost();
  const { sendTargetedMessage, isSending } = useMessageMutations();

  const selectedClass = useMemo(
    () => classes.find(cls => cls.id === selectedClassId) ?? classes[0] ?? null,
    [classes, selectedClassId]
  );
  const isAnnouncementLane = getMessageShowDeliveryLane(recipient) === 'announcement';
  const isSendingMessage = isSending || isPostingAnnouncement;

  function reset() {
    const nextClassId = classes[0]?.id ?? '';
    const draft = buildMessageShowDraft(DEFAULT_MESSAGE_SHOW_TEMPLATE.id, classes[0]?.label);
    setRecipient('all_show');
    setSelectedTemplateId(DEFAULT_MESSAGE_SHOW_TEMPLATE.id);
    setSelectedClassId(nextClassId);
    setTitle(draft.title);
    setMessage(draft.body);
    setSendPushAlert(true);
  }

  function handleSent() {
    reset();
    onSent?.();
  }

  function applyTemplate(templateId: MessageShowTemplateId) {
    const classLabel = selectedClass?.label;
    const draft = buildMessageShowDraft(templateId, classLabel);
    setSelectedTemplateId(templateId);
    setTitle(draft.title);
    setMessage(draft.body);
  }

  function handleRecipientChange(nextRecipient: MessageShowRecipientType) {
    setRecipient(nextRecipient);
  }

  function handleClassChange(classId: string) {
    const nextClass = classes.find(cls => cls.id === classId) ?? null;
    setSelectedClassId(classId);
    const draft = buildMessageShowDraft(selectedTemplateId, nextClass?.label);
    setTitle(draft.title);
    setMessage(draft.body);
  }

  async function handleSend() {
    if (!message.trim() || (isAnnouncementLane && !title.trim())) {
      toast.error('Add a title and message before sending');
      return;
    }

    if (isAnnouncementLane) {
      setIsPostingAnnouncement(true);
      let handledPost = false;
      try {
        const posted = await postAnnouncement({
          showId,
          title: title.trim(),
          content: message.trim(),
          priority: getWorkbenchAnnouncementPriority(sendPushAlert),
          expiresAt: buildMessageShowAnnouncementExpiresAt(),
          successMessage: sendPushAlert
            ? 'Message posted and push alert queued'
            : 'Message posted to show',
          errorMessage: 'Could not send show message',
          undoSuccessMessage: 'Show message removed',
          undoErrorMessage: 'Could not remove show message',
          onPosted: () => {
            handledPost = true;
            handleSent();
          },
        });
        if (posted && !handledPost) {
          handleSent();
        }
      } finally {
        setIsPostingAnnouncement(false);
      }
      return;
    }

    if (recipient === 'class') {
      if (!selectedClass) {
        toast.error('Select a class before sending');
        return;
      }
      if (selectedClass.entryCount <= 0) {
        toast.error('No exhibitors are entered in that class yet');
        return;
      }
      const result = await sendTargetedMessage(
        showId,
        { type: 'class', classId: selectedClass.id, sendPush: sendPushAlert },
        message.trim()
      );
      if (result) handleSent();
      return;
    }

    const result = await sendTargetedMessage(
      showId,
      { type: 'checked_in', sendPush: sendPushAlert },
      message.trim()
    );
    if (result) handleSent();
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="message-show-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="message-show-title" className="text-base font-semibold">
            Show Messages
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a show message to everyone or a targeted group.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showHistoryLink ? (
            <Button asChild type="button" variant="outline" size="sm">
              <Link to={`/secretary/messages?showId=${encodeURIComponent(showId)}`}>
                <History className="mr-2 h-4 w-4" aria-hidden="true" />
                History
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={isSendingMessage}
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleSend} disabled={isSendingMessage}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {isSendingMessage ? 'Sending...' : 'Send message'}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="space-y-2">
          <Label id="message-show-recipient-label">Recipient</Label>
          <Select value={recipient} onValueChange={handleRecipientChange}>
            <SelectTrigger className="w-full" aria-labelledby="message-show-recipient-label">
              <SelectValue>{RECIPIENT_LABELS[recipient]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-full">
              {Object.entries(RECIPIENT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recipient === 'class' ? (
          <div className="space-y-2">
            <Label id="message-show-class-label">Class</Label>
            <Select
              value={selectedClass?.id ?? ''}
              onValueChange={handleClassChange}
              disabled={!classes.length}
            >
              <SelectTrigger className="w-full" aria-labelledby="message-show-class-label">
                <SelectValue placeholder="Select a class">
                  {selectedClass
                    ? `${selectedClass.label} · ${entryCountLabel(selectedClass.entryCount)}`
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-full">
                {classes.map(cls => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.label} · {entryCountLabel(cls.entryCount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {MESSAGE_SHOW_TEMPLATES.map(template => (
          <Button
            key={template.id}
            type="button"
            variant={selectedTemplateId === template.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyTemplate(template.id)}
          >
            <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
            {template.label}
          </Button>
        ))}
      </div>

      <WorkbenchPushAlertToggle
        id="message-show-push"
        checked={sendPushAlert}
        onCheckedChange={setSendPushAlert}
        description="Use for time-sensitive updates. Otherwise this sends quietly."
      />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isAnnouncementLane ? (
          <div className="space-y-2">
            <Label htmlFor="message-show-title-input">Title</Label>
            <Input
              id="message-show-title-input"
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={200}
            />
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="message-show-message">Message</Label>
          <Textarea
            id="message-show-message"
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={4}
            maxLength={5000}
          />
        </div>
      </div>
    </section>
  );
}
