/**
 * Dog Card Component
 *
 * Displays individual dog information with edit/delete actions
 */

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dog, Pencil, Trash2 } from 'lucide-react';
import type { ExhibitorDog } from '@/services/exhibitorService';

interface DogCardProps {
  dog: ExhibitorDog;
  onEdit: () => void;
  onDelete: () => void;
}

export function DogCard({ dog, onEdit, onDelete }: DogCardProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <Avatar className="w-14 h-14 border border-border">
          {dog.image_url ? (
            <AvatarImage src={dog.image_url} alt={dog.call_name || dog.name} />
          ) : null}
          <AvatarFallback className="bg-muted">
            <Dog className="h-7 w-7 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{dog.call_name || dog.name}</p>
          <p className="text-sm text-muted-foreground">
            {dog.breed} {dog.sex && `• ${dog.sex.charAt(0).toUpperCase() + dog.sex.slice(1)}`}
            {/* status column added via migration 039 — not yet in generated Supabase types */}
            {(() => {
              const status = (dog as Record<string, unknown>).status;
              if (status === 'retired')
                return (
                  <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                    • Retired
                  </span>
                );
              if (status === 'deceased')
                return (
                  <span className="ml-2 text-gray-500 dark:text-gray-400 font-medium">
                    • Deceased
                  </span>
                );
              return (
                <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
                  • Active
                </span>
              );
            })()}
          </p>
          {dog.akc_number && (
            <p className="text-sm text-muted-foreground font-mono">AKC: {dog.akc_number}</p>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit dog">
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit dog</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Remove dog">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove dog</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
