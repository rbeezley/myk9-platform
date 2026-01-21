import { PartyPopper } from 'lucide-react';

interface ClassCompletionCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  totalDogs: number;
  qualifiedDogs: number;
  actualStartTime: string;
  actualEndTime: string;
}

export function ClassCompletionCelebration({
  isOpen,
  onClose,
  className,
  totalDogs,
  qualifiedDogs
}: ClassCompletionCelebrationProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white p-6 rounded-lg max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-yellow-500" /> Class Complete!
        </h2>
        <p className="mb-2">{className}</p>
        <p className="text-sm text-gray-600">
          {qualifiedDogs} of {totalDogs} dogs qualified
        </p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
