import { useState } from 'react';
import { Megaphone, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  CLASS_BROADCAST_TEMPLATES,
  DEFAULT_CLASS_BROADCAST_TEMPLATE,
  buildClassBroadcastMessage,
  type ClassBroadcastClassOption,
  type ClassBroadcastTemplateId,
} from './classBroadcast';

interface ClassBroadcastCardProps {
  showId: string;
  classes: ClassBroadcastClassOption[];
}

function entryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

export function ClassBroadcastCard({ showId, classes }: ClassBroadcastCardProps) {
  const [selectedClassIdOverride, setSelectedClassIdOverride] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<ClassBroadcastTemplateId>(
    DEFAULT_CLASS_BROADCAST_TEMPLATE.id
  );
  const [messageOverride, setMessageOverride] = useState<string | null>(null);
  const { sendTargetedMessage, isSending } = useMessageMutations();

  const selectedClass =
    classes.find(cls => cls.id === selectedClassIdOverride) ?? classes[0] ?? null;
  const message =
    messageOverride ??
    (selectedClass ? buildClassBroadcastMessage(selectedTemplateId, selectedClass.label) : '');
  const canSend = Boolean(selectedClass && selectedClass.entryCount > 0 && message.trim());

  function applyTemplate(templateId: ClassBroadcastTemplateId) {
    setSelectedTemplateId(templateId);
    setMessageOverride(null);
  }

  function handleClassChange(classId: string) {
    setSelectedClassIdOverride(classId);
    setMessageOverride(null);
  }

  function reset() {
    applyTemplate(DEFAULT_CLASS_BROADCAST_TEMPLATE.id);
  }

  async function handleSend() {
    if (!selectedClass || !canSend) return;
    const result = await sendTargetedMessage(
      showId,
      { type: 'class', classId: selectedClass.id },
      message.trim()
    );
    if (result) {
      reset();
    }
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="class-broadcast-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="class-broadcast-title" className="text-base font-semibold">
            Message a class
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Canned direct messages for one class.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={!selectedClass || isSending}
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleSend} disabled={!canSend || isSending}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {isSending ? 'Sending...' : 'Send class message'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr),auto] sm:items-end">
        <div className="space-y-2">
          <Label id="class-broadcast-target-label">Class</Label>
          <Select
            value={selectedClass?.id ?? ''}
            onValueChange={handleClassChange}
            disabled={!classes.length}
          >
            <SelectTrigger aria-labelledby="class-broadcast-target-label">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map(cls => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.label} · {entryCountLabel(cls.entryCount)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedClass ? (
          <p className="text-sm text-muted-foreground">
            {entryCountLabel(selectedClass.entryCount)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No classes loaded</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CLASS_BROADCAST_TEMPLATES.map(template => (
          <Button
            key={template.id}
            type="button"
            variant={selectedTemplateId === template.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyTemplate(template.id)}
            disabled={!selectedClass}
          >
            <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
            {template.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="class-broadcast-message">Message</Label>
        <Textarea
          id="class-broadcast-message"
          value={message}
          onChange={event => setMessageOverride(event.target.value)}
          rows={3}
          maxLength={5000}
          disabled={!selectedClass}
        />
        {selectedClass && selectedClass.entryCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No exhibitors entered yet — nothing to deliver.
          </p>
        ) : null}
      </div>
    </section>
  );
}
