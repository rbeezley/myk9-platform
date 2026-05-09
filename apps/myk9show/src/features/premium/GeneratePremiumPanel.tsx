import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PremiumContentEditor } from './PremiumContentEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  showId: string;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | null;
}

export function GeneratePremiumPanel({ open, onClose, showId, clubId, showOrg }: Props) {
  return (
    <Sheet open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Premium List</SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          <PremiumContentEditor showId={showId} clubId={clubId} showOrg={showOrg} active={open} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
