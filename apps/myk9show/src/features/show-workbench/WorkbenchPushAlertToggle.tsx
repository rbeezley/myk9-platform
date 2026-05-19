import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface WorkbenchPushAlertToggleProps {
  checked: boolean;
  description: string;
  id: string;
  onCheckedChange: (checked: boolean) => void;
}

export function WorkbenchPushAlertToggle({
  checked,
  description,
  id,
  onCheckedChange,
}: WorkbenchPushAlertToggleProps) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/35 px-3 py-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          Send push alert
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
