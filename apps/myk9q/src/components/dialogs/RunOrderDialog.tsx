import React, { useState } from 'react';
import { X, ArrowUpDown, Shuffle, GripVertical } from 'lucide-react';
import { Entry } from '../../stores/entryStore';
import { logger } from '@/utils/logger';
import type { RunOrderScope, RenumberMode } from '../../services/runOrderService';
import './shared-dialog.css';
import './RunOrderDialog.css';

export type RunOrderPreset =
  | 'a-then-b-asc'
  | 'a-then-b-desc'
  | 'b-then-a-asc'
  | 'b-then-a-desc'
  | 'combined-asc'
  | 'combined-desc'
  | 'random-all'
  | 'random-sections'
  | 'armband-asc'
  | 'armband-desc'
  | 'random'
  | 'manual';

interface RunOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entries: Entry[];
  onApplyOrder: (preset: RunOrderPreset, scope?: RunOrderScope, renumberMode?: RenumberMode) => Promise<void>;
  onOpenDragMode: () => void;
}

type DialogStep = 'presets' | 'renumber';

export const RunOrderDialog: React.FC<RunOrderDialogProps> = ({
  isOpen,
  onClose,
  entries,
  onApplyOrder,
  onOpenDragMode
}) => {
  const [selectedOrder, setSelectedOrder] = useState<RunOrderPreset | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [scope, setScope] = useState<RunOrderScope>('all');
  const [step, setStep] = useState<DialogStep>('presets');

  // Detect if entries have A/B sections
  const hasSections = entries.some(e => e.section === 'A' || e.section === 'B');

  // Reset state when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedOrder(null);
      setIsApplying(false);
      setScope('all');
      setStep('presets');
    }
  }, [isOpen]);

  // Reset selected order when scope changes (presets differ per scope)
  React.useEffect(() => {
    setSelectedOrder(null);
  }, [scope]);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedOrder) return;

    // Handle manual drag and drop — opens drag mode directly, no renumber step
    if (selectedOrder === 'manual') {
      onClose();
      onOpenDragMode();
      return;
    }

    // For single-section scope, show renumber step before applying
    if (scope !== 'all' && step === 'presets') {
      setStep('renumber');
      return;
    }

    // Apply preset
    setIsApplying(true);
    try {
      await onApplyOrder(selectedOrder, scope, 'renumber');
    } catch (error) {
      logger.error('Error applying run order:', error);
      setIsApplying(false);
    }
  };

  const handleApplyWithRenumberMode = async (mode: RenumberMode) => {
    if (!selectedOrder) return;
    setIsApplying(true);
    try {
      await onApplyOrder(selectedOrder, scope, mode);
    } catch (error) {
      logger.error('Error applying run order:', error);
      setIsApplying(false);
    }
  };

  const sectionLabel = scope === 'A' ? 'Section A' : 'Section B';
  const otherSectionLabel = scope === 'A' ? 'Section B' : 'Section A';

  const renderScopePicker = () => {
    if (!hasSections) return null;

    return (
      <div className="run-order-scope-picker">
        <button
          className={`scope-option${scope === 'all' ? ' scope-option-active' : ''}`}
          onClick={() => setScope('all')}
        >
          All (A & B)
        </button>
        <button
          className={`scope-option${scope === 'A' ? ' scope-option-active' : ''}`}
          onClick={() => setScope('A')}
        >
          Section A
        </button>
        <button
          className={`scope-option${scope === 'B' ? ' scope-option-active' : ''}`}
          onClick={() => setScope('B')}
        >
          Section B
        </button>
      </div>
    );
  };

  const renderRenumberStep = () => {
    return (
      <div className="renumber-step">
        <p className="renumber-intro">
          You're reordering <strong>{sectionLabel}</strong> entries. What should happen to <strong>{otherSectionLabel}</strong>?
        </p>
        <div className="renumber-options">
          <button
            className="renumber-option"
            onClick={() => handleApplyWithRenumberMode('preserve')}
            disabled={isApplying}
          >
            <div className="renumber-option-content">
              <span className="renumber-option-label">Preserve {otherSectionLabel}</span>
              <span className="renumber-option-description">
                Only renumber {sectionLabel} entries. {otherSectionLabel} keeps its current run order.
              </span>
            </div>
          </button>
          <button
            className="renumber-option"
            onClick={() => handleApplyWithRenumberMode('renumber')}
            disabled={isApplying}
          >
            <div className="renumber-option-content">
              <span className="renumber-option-label">Renumber all</span>
              <span className="renumber-option-description">
                {sectionLabel} runs first (1, 2, 3…), then {otherSectionLabel} continues (4, 5, 6…).
              </span>
            </div>
          </button>
        </div>
        {isApplying && <p className="renumber-applying">Applying…</p>}
      </div>
    );
  };

  const renderSectionScopeOptions = () => {
    // Simplified presets for single-section scope
    return (
      <>
        <div className="run-order-option">
          <input
            type="radio"
            id="armband-asc"
            name="runOrder"
            value="armband-asc"
            checked={selectedOrder === 'armband-asc'}
            onChange={() => setSelectedOrder('armband-asc')}
          />
          <label htmlFor="armband-asc">
            <div className="run-order-icon">
              <ArrowUpDown size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </div>
            <div className="run-order-content">
              <span className="run-order-label">Armband Low to High</span>
              <span className="run-order-description">Sort {sectionLabel} entries by armband (ascending)</span>
            </div>
          </label>
        </div>
        <div className="run-order-option">
          <input
            type="radio"
            id="armband-desc"
            name="runOrder"
            value="armband-desc"
            checked={selectedOrder === 'armband-desc'}
            onChange={() => setSelectedOrder('armband-desc')}
          />
          <label htmlFor="armband-desc">
            <div className="run-order-icon">
              <ArrowUpDown size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </div>
            <div className="run-order-content">
              <span className="run-order-label">Armband High to Low</span>
              <span className="run-order-description">Sort {sectionLabel} entries by armband (descending)</span>
            </div>
          </label>
        </div>
        <div className="run-order-option">
          <input
            type="radio"
            id="random"
            name="runOrder"
            value="random"
            checked={selectedOrder === 'random'}
            onChange={() => setSelectedOrder('random')}
          />
          <label htmlFor="random">
            <div className="run-order-icon">
              <Shuffle size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </div>
            <div className="run-order-content">
              <span className="run-order-label">Random Shuffle</span>
              <span className="run-order-description">Randomly shuffle {sectionLabel} entries</span>
            </div>
          </label>
        </div>
        <div className="run-order-option">
          <input
            type="radio"
            id="manual"
            name="runOrder"
            value="manual"
            checked={selectedOrder === 'manual'}
            onChange={() => setSelectedOrder('manual')}
          />
          <label htmlFor="manual">
            <div className="run-order-icon">
              <GripVertical size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </div>
            <div className="run-order-content">
              <span className="run-order-label">Manual Drag and Drop</span>
              <span className="run-order-description">Manually reorder entries by dragging</span>
            </div>
          </label>
        </div>
      </>
    );
  };

  const renderAllScopeOptions = () => {
    // Full section-aware presets — Combined first (most common)
    return (
      <>
        <div className="run-order-group">
          <div className="run-order-group-label">Combined (ignore sections):</div>
          <div className="run-order-option">
            <input
              type="radio"
              id="combined-asc"
              name="runOrder"
              value="combined-asc"
              checked={selectedOrder === 'combined-asc'}
              onChange={() => setSelectedOrder('combined-asc')}
            />
            <label htmlFor="combined-asc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband Low to High</span>
                <span className="run-order-description">All dogs sorted by armband (sections ignored)</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="combined-desc"
              name="runOrder"
              value="combined-desc"
              checked={selectedOrder === 'combined-desc'}
              onChange={() => setSelectedOrder('combined-desc')}
            />
            <label htmlFor="combined-desc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband High to Low</span>
                <span className="run-order-description">All dogs sorted by armband descending (sections ignored)</span>
              </div>
            </label>
          </div>
        </div>

        <div className="run-order-group">
          <div className="run-order-group-label">Section A then B:</div>
          <div className="run-order-option">
            <input
              type="radio"
              id="a-then-b-asc"
              name="runOrder"
              value="a-then-b-asc"
              checked={selectedOrder === 'a-then-b-asc'}
              onChange={() => setSelectedOrder('a-then-b-asc')}
            />
            <label htmlFor="a-then-b-asc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband Low to High</span>
                <span className="run-order-description">A section first (ascending), then B section (ascending)</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="a-then-b-desc"
              name="runOrder"
              value="a-then-b-desc"
              checked={selectedOrder === 'a-then-b-desc'}
              onChange={() => setSelectedOrder('a-then-b-desc')}
            />
            <label htmlFor="a-then-b-desc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband High to Low</span>
                <span className="run-order-description">A section first (descending), then B section (descending)</span>
              </div>
            </label>
          </div>
        </div>

        <div className="run-order-group">
          <div className="run-order-group-label">Section B then A:</div>
          <div className="run-order-option">
            <input
              type="radio"
              id="b-then-a-asc"
              name="runOrder"
              value="b-then-a-asc"
              checked={selectedOrder === 'b-then-a-asc'}
              onChange={() => setSelectedOrder('b-then-a-asc')}
            />
            <label htmlFor="b-then-a-asc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband Low to High</span>
                <span className="run-order-description">B section first (ascending), then A section (ascending)</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="b-then-a-desc"
              name="runOrder"
              value="b-then-a-desc"
              checked={selectedOrder === 'b-then-a-desc'}
              onChange={() => setSelectedOrder('b-then-a-desc')}
            />
            <label htmlFor="b-then-a-desc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband High to Low</span>
                <span className="run-order-description">B section first (descending), then A section (descending)</span>
              </div>
            </label>
          </div>
        </div>

        <div className="run-order-group">
          <div className="run-order-group-label">Other:</div>
          <div className="run-order-option">
            <input
              type="radio"
              id="random-all"
              name="runOrder"
              value="random-all"
              checked={selectedOrder === 'random-all'}
              onChange={() => setSelectedOrder('random-all')}
            />
            <label htmlFor="random-all">
              <div className="run-order-icon">
                <Shuffle size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Random Shuffle (all dogs)</span>
                <span className="run-order-description">Completely randomize all entries</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="random-sections"
              name="runOrder"
              value="random-sections"
              checked={selectedOrder === 'random-sections'}
              onChange={() => setSelectedOrder('random-sections')}
            />
            <label htmlFor="random-sections">
              <div className="run-order-icon">
                <Shuffle size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Random Shuffle (within sections)</span>
                <span className="run-order-description">Randomize A section, then randomize B section</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="manual"
              name="runOrder"
              value="manual"
              checked={selectedOrder === 'manual'}
              onChange={() => setSelectedOrder('manual')}
            />
            <label htmlFor="manual">
              <div className="run-order-icon">
                <GripVertical size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Manual Drag and Drop</span>
                <span className="run-order-description">Manually reorder entries by dragging</span>
              </div>
            </label>
          </div>
        </div>
      </>
    );
  };

  const renderOptions = () => {
    if (hasSections) {
      if (scope === 'all') {
        return renderAllScopeOptions();
      } else {
        return renderSectionScopeOptions();
      }
    } else {
      // Regular classes (no sections) — unchanged
      return (
        <>
          <div className="run-order-option">
            <input
              type="radio"
              id="armband-asc"
              name="runOrder"
              value="armband-asc"
              checked={selectedOrder === 'armband-asc'}
              onChange={() => setSelectedOrder('armband-asc')}
            />
            <label htmlFor="armband-asc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband Low to High</span>
                <span className="run-order-description">Sort entries by armband number (ascending)</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="armband-desc"
              name="runOrder"
              value="armband-desc"
              checked={selectedOrder === 'armband-desc'}
              onChange={() => setSelectedOrder('armband-desc')}
            />
            <label htmlFor="armband-desc">
              <div className="run-order-icon">
                <ArrowUpDown size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Armband High to Low</span>
                <span className="run-order-description">Sort entries by armband number (descending)</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="random"
              name="runOrder"
              value="random"
              checked={selectedOrder === 'random'}
              onChange={() => setSelectedOrder('random')}
            />
            <label htmlFor="random">
              <div className="run-order-icon">
                <Shuffle size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Random Shuffle</span>
                <span className="run-order-description">Completely randomize entry order</span>
              </div>
            </label>
          </div>
          <div className="run-order-option">
            <input
              type="radio"
              id="manual"
              name="runOrder"
              value="manual"
              checked={selectedOrder === 'manual'}
              onChange={() => setSelectedOrder('manual')}
            />
            <label htmlFor="manual">
              <div className="run-order-icon">
                <GripVertical size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              </div>
              <div className="run-order-content">
                <span className="run-order-label">Manual Drag and Drop</span>
                <span className="run-order-description">Manually reorder entries by dragging</span>
              </div>
            </label>
          </div>
        </>
      );
    }
  };

  const scopeEntryCount = scope === 'all'
    ? entries.length
    : entries.filter(e => e.section === scope).length;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-container run-order-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">Set Run Order</h2>
          <button
            className="dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={24}  style={{ width: '24px', height: '24px', flexShrink: 0 }} />
          </button>
        </div>

        <div className="dialog-content">
          {renderScopePicker()}

          {step === 'presets' ? (
            <>
              <p className="run-order-intro">
                Choose how to order the {scopeEntryCount} {scope !== 'all' ? `${sectionLabel} ` : ''}entries{scope === 'all' ? ' in this class' : ''}:
              </p>
              <div className="run-order-options">
                {renderOptions()}
              </div>
            </>
          ) : (
            renderRenumberStep()
          )}
        </div>

        {step === 'presets' && (
          <div className="dialog-actions">
            <button
              className="dialog-button dialog-button-secondary"
              onClick={onClose}
              disabled={isApplying}
            >
              Cancel
            </button>
            <button
              className="dialog-button dialog-button-primary"
              onClick={handleApply}
              disabled={!selectedOrder || isApplying}
            >
              {isApplying ? 'Applying...' : scope !== 'all' && selectedOrder !== 'manual' ? 'Next' : 'Apply'}
            </button>
          </div>
        )}

        {step === 'renumber' && (
          <div className="dialog-actions">
            <button
              className="dialog-button dialog-button-secondary"
              onClick={() => setStep('presets')}
              disabled={isApplying}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
