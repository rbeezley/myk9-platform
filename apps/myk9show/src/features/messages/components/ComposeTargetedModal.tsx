import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, Users } from 'lucide-react';

interface ClassOption {
  id: string;
  class_number: number;
  class_name: string;
  entry_count: number;
}

interface ComposeTargetedModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (classId: string, body: string) => Promise<void>;
  classes: ClassOption[];
  preSelectedClassId?: string;
}

export function ComposeTargetedModal({
  open,
  onClose,
  onSend,
  classes,
  preSelectedClassId,
}: ComposeTargetedModalProps) {
  const [selectedClassId, setSelectedClassId] = useState(preSelectedClassId ?? '');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Reset state when dialog opens or preSelectedClassId changes to avoid stale values
  useEffect(() => {
    if (open) {
      setSelectedClassId(preSelectedClassId ?? '');
      setBody('');
    }
  }, [open, preSelectedClassId]);

  const selectedClass = classes.find(c => c.id === selectedClassId);

  const handleSend = async () => {
    if (!selectedClassId || !body.trim()) return;
    setIsSending(true);
    try {
      await onSend(selectedClassId, body.trim());
      setBody('');
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message Class Exhibitors</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!preSelectedClassId ? (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Select a class</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      Class {c.class_number} — {c.class_name} ({c.entry_count} entries)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selectedClass && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
              <Users className="h-4 w-4" />
              <span>
                Class {selectedClass.class_number} — {selectedClass.class_name} ·{' '}
                {selectedClass.entry_count} exhibitors
              </span>
            </div>
          )}

          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Type a message..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !selectedClassId || !body.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
