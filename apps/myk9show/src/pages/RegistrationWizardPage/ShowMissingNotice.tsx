import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Shown in place of the wizard when no show is selected or the show does not exist. */
export function ShowMissingNotice({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={() => navigate('/shows')}>
          Browse Shows
        </Button>
      </div>
    </div>
  );
}
