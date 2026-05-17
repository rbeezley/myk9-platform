import { useMemo, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getShowMapMessageTemplates } from './showMapMessageTemplates';
import type { ShowMapNode } from './showMapTypes';

interface ShowMapMessageHandlerDialogProps {
  open: boolean;
  node: ShowMapNode | undefined;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (body: string) => void;
}

export function ShowMapMessageHandlerDialog({
  open,
  node,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: ShowMapMessageHandlerDialogProps) {
  const templates = useMemo(() => getShowMapMessageTemplates(node), [node]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? '');
  const [body, setBody] = useState(templates[0]?.body ?? '');

  const display = node?.entryDisplay;
  const entryName = display?.dogName ?? node?.label ?? 'this entry';
  const armband = display?.armband;
  const handler = display?.handler;

  const selectTemplate = (templateId: string) => {
    const template = templates.find(item => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(template.id);
    setBody(template.body);
  };

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Message handler
          </DialogTitle>
          <DialogDescription>Send a quick note about this entry.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4 text-sm">
            <div className="font-medium">{entryName}</div>
            {armband && <div className="text-muted-foreground">Armband {armband}</div>}
            {handler && <div className="text-muted-foreground">Handler: {handler}</div>}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map(template => (
              <Button
                key={template.id}
                type="button"
                variant={template.id === selectedTemplateId ? 'secondary' : 'outline'}
                className="justify-start text-left"
                onClick={() => selectTemplate(template.id)}
              >
                {template.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-map-handler-message">Message</Label>
            <Textarea
              id="show-map-handler-message"
              value={body}
              onChange={event => {
                setBody(event.target.value);
                setSelectedTemplateId('');
              }}
              maxLength={5000}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={isSubmitting || !body.trim()}>
            <Send className="h-4 w-4" />
            {isSubmitting ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
