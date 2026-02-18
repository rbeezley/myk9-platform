/**
 * ScoresheetPrintDialog
 *
 * Lightweight dialog that appears when user clicks a print option.
 * Asks the user to choose sort order before printing.
 */

import React from 'react';
import { ClipboardList, ArrowUpDown, Hash, Trophy } from 'lucide-react';
import { DialogContainer } from './DialogContainer';
import './shared-dialog.css';

export type PrintSortOrder = 'run-order' | 'armband' | 'placement';

export interface ScoresheetPrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (sortOrder: PrintSortOrder) => void;
  title?: string;
  /** Override the two button labels and sort values. Defaults to Run Order / Armband Number. */
  options?: {
    primary: { label: string; sortOrder: PrintSortOrder };
    secondary: { label: string; sortOrder: PrintSortOrder };
  };
}

export const ScoresheetPrintDialog: React.FC<ScoresheetPrintDialogProps> = ({
  isOpen,
  onClose,
  onPrint,
  title,
  options,
}) => {
  const primary = options?.primary ?? {
    label: 'Run Order',
    sortOrder: 'run-order' as PrintSortOrder,
  };
  const secondary = options?.secondary ?? {
    label: 'Armband Number',
    sortOrder: 'armband' as PrintSortOrder,
  };

  const PrimaryIcon = primary.sortOrder === 'placement' ? Trophy : ArrowUpDown;

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Print Scoresheet'}
      icon={<ClipboardList size={20} />}
      maxWidth="340px"
    >
      <p style={{ margin: '0 0 1rem', fontSize: '14px', color: '#666' }}>Sort entries by:</p>
      <div className="dialog-actions" style={{ gap: '0.75rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => onPrint(primary.sortOrder)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <PrimaryIcon size={16} />
          {primary.label}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => onPrint(secondary.sortOrder)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <Hash size={16} />
          {secondary.label}
        </button>
      </div>
    </DialogContainer>
  );
};
