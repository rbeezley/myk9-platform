import { useMemo, useState } from 'react';
import { CalendarClock, History, Megaphone, RotateCcw, Send } from 'lucide-react';
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
import { useMessageEmailAudience } from '@/features/messages/hooks/useMessageEmailAudience';
import type { MessageTarget } from '@/features/messages/types';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import {
  MESSAGE_SHOW_TEMPLATES,
  buildMessageShowAnnouncementExpiresAt,
  buildMessageShowDraft,
  getMessageShowDeliveryLane,
  type MessageShowClassOption,
  type MessageShowDeliveryLane,
  type MessageShowRecipientType,
  type MessageShowTemplateId,
} from './messageShow';
import {
  buildEmailAudienceCopy,
  describeEmailAudience,
  type TargetedSendResult,
} from './messageShowEmail';
import { describeSendOutcome, type SendOutcome } from './messageShowOutcome';
import { WorkbenchPushAlertToggle } from './WorkbenchPushAlertToggle';
import { getWorkbenchAnnouncementPriority } from './workbenchAnnouncementPriority';
import { useWorkbenchAnnouncementPost } from './workbenchAnnouncementPost';

interface MessageShowComposerProps {
  showId: string;
  classes: MessageShowClassOption[];
  onSent?: () => void;
  showHistoryLink?: boolean;
  allowedRecipients?: readonly MessageShowRecipientType[];
  showWideDeliveryLane?: MessageShowDeliveryLane;
  /** Offer "Also send by email". Secretaries and admins only: the server enforces it. */
  allowEmail?: boolean;
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
  allowedRecipients = ['all_show', 'class', 'checked_in'],
  showWideDeliveryLane = 'announcement',
  allowEmail = false,
}: MessageShowComposerProps) {
  const defaultRecipient = allowedRecipients[0] ?? 'all_show';
  const [recipient, setRecipient] = useState<MessageShowRecipientType>(defaultRecipient);
  // INTENT: a fresh composer is empty with no template chosen, so a reflex press of Send
  // can never broadcast canned copy (MYK9-1616).
  const [selectedTemplateId, setSelectedTemplateId] = useState<MessageShowTemplateId | null>(null);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sendPushAlert, setSendPushAlert] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  // Set when the message went out in the app but the email did not (all of it, or some
  // addresses). The text stays; nothing is re-sent automatically.
  const [notice, setNotice] = useState<SendOutcome | null>(null);
  const { postAnnouncement } = useWorkbenchAnnouncementPost();
  const { sendTargetedMessage, isSending } = useMessageMutations();

  const selectedClass = useMemo(
    () => classes.find(cls => cls.id === selectedClassId) ?? classes[0] ?? null,
    [classes, selectedClassId]
  );
  const isAnnouncementLane =
    recipient === 'all_show'
      ? showWideDeliveryLane === 'announcement'
      : getMessageShowDeliveryLane(recipient) === 'announcement';
  const isSendingMessage = isSending || isPostingAnnouncement;
  const canSend = Boolean(message.trim()) && (!isAnnouncementLane || Boolean(title.trim()));
  const emailRequested = allowEmail && sendEmail;
  const emailOption = emailRequested ? { sendEmail: true } : {};
  const emailTarget: MessageTarget | null =
    recipient === 'class'
      ? selectedClass
        ? { type: 'class', classId: selectedClass.id }
        : null
      : { type: recipient };
  const emailAudienceQuery = useMessageEmailAudience(showId, emailTarget, emailRequested);
  const emailAudience = describeEmailAudience(recipient, selectedClass?.label);
  const recipientOptions = Object.entries(RECIPIENT_LABELS).filter(([value]) =>
    allowedRecipients.includes(value as MessageShowRecipientType)
  );

  function reset() {
    const nextClassId = classes[0]?.id ?? '';
    setRecipient(defaultRecipient);
    setSelectedTemplateId(null);
    setSelectedClassId(nextClassId);
    setTitle('');
    setMessage('');
    setSendPushAlert(true);
    setSendEmail(false);
    setNotice(null);
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
    if (!selectedTemplateId) return;
    const draft = buildMessageShowDraft(selectedTemplateId, nextClass?.label);
    setTitle(draft.title);
    setMessage(draft.body);
  }

  // The outcome is computed in one pure function; the form clears only when it says so.
  function finishSend(result: TargetedSendResult | null, announcementPosted = false) {
    const outcome = describeSendOutcome({ result, announcementPosted, emailRequested });
    if (outcome.clear) handleSent();
    else setNotice(outcome);
  }

  async function handleSend() {
    if (!message.trim() || (isAnnouncementLane && !title.trim())) {
      toast.error('Add a title and message before sending');
      return;
    }

    setNotice(null);

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
            // With email on, the form is cleared only once the email call has succeeded.
            if (!emailRequested) handleSent();
          },
        });
        if (posted && !emailRequested && !handledPost) {
          handleSent();
        }
        if (posted && emailRequested) {
          // The announcement is the in-app copy; the server only mails the audience.
          const emailResult = await sendTargetedMessage(
            showId,
            { type: recipient, sendPush: false, emailOnly: true },
            message.trim()
          );
          finishSend(emailResult, true);
        }
      } finally {
        setIsPostingAnnouncement(false);
      }
      return;
    }

    if (recipient === 'all_show') {
      const result = await sendTargetedMessage(
        showId,
        { type: 'all_show', sendPush: sendPushAlert, ...emailOption },
        message.trim()
      );
      finishSend(result);
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
        {
          type: 'class',
          classId: selectedClass.id,
          sendPush: sendPushAlert,
          ...emailOption,
        },
        message.trim()
      );
      finishSend(result);
      return;
    }

    const result = await sendTargetedMessage(
      showId,
      { type: 'checked_in', sendPush: sendPushAlert, ...emailOption },
      message.trim()
    );
    finishSend(result);
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
            <>
              <Button asChild type="button" variant="outline" size="sm">
                <Link
                  to={`/secretary/messages?showId=${encodeURIComponent(showId)}&section=scheduled`}
                >
                  <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                  Scheduled
                </Link>
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link to={`/secretary/messages?showId=${encodeURIComponent(showId)}`}>
                  <History className="mr-2 h-4 w-4" aria-hidden="true" />
                  History
                </Link>
              </Button>
            </>
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
              {recipientOptions.map(([value, label]) => (
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

      {allowEmail ? (
        <div>
          <WorkbenchPushAlertToggle
            id="message-show-email"
            label="Also send by email"
            checked={sendEmail}
            onCheckedChange={setSendEmail}
            description="Reaches exhibitors who do not have the app open or push turned on."
          />
          {sendEmail ? (
            <p
              id="message-show-email-audience"
              className="mt-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              {emailAudienceQuery.data
                ? buildEmailAudienceCopy(emailAudience, emailAudienceQuery.data)
                : emailAudienceQuery.isError
                  ? `Could not count email recipients. Everyone in ${emailAudience} with an email address on file will still get it.`
                  : emailTarget
                    ? 'Counting who will get the email...'
                    : 'Select a class to see who will get the email.'}
            </p>
          ) : null}
        </div>
      ) : null}

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

      {notice ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p>
            {notice.message} Nothing was sent again. Your text is still here.
            {notice.showHistoryLink ? (
              <>
                {' '}
                <Link
                  className="underline"
                  to={`/secretary/messages?showId=${encodeURIComponent(showId)}&view=email`}
                >
                  See Email delivery history
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {!canSend && (
          <p id="message-show-send-hint" className="text-sm text-muted-foreground">
            {isAnnouncementLane ? 'Add a title and message to send.' : 'Write a message to send.'}
          </p>
        )}
        <Button
          type="button"
          onClick={handleSend}
          disabled={isSendingMessage || !canSend}
          aria-describedby={canSend ? undefined : 'message-show-send-hint'}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden="true" />
          {isSendingMessage ? 'Sending...' : 'Send message'}
        </Button>
      </div>
    </section>
  );
}
