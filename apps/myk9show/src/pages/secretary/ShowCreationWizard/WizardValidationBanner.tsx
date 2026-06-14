import React from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface WizardValidationBannerProps {
  /** Non-empty list of validation messages for the current step. */
  messages: string[];
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Collapsible validation banner shown above the step content after the user
 * attempts to advance past a step with missing required fields. Rendered as a
 * labelled disclosure: the toggle button exposes `aria-expanded` /
 * `aria-controls`, wired to the details region's `id`.
 *
 * NOTE: the `aria-expanded` / `aria-controls="wizard-validation-details"` /
 * `id="wizard-validation-details"` strings are pinned by the source-text guard
 * `src/test/components/wizard/wizardThemingA11y.test.ts`. Keep them verbatim.
 */
export const WizardValidationBanner: React.FC<WizardValidationBannerProps> = ({
  messages,
  expanded,
  onToggle,
}) => (
  <div className="relative border-b border-warning/30 rounded-t-2xl overflow-hidden">
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls="wizard-validation-details"
      className="w-full px-6 sm:px-8 py-3 bg-gradient-to-r from-amber-50/80 to-amber-100/80 dark:from-amber-900/30 dark:to-amber-800/30 backdrop-blur-sm flex items-center justify-between hover:from-amber-100/80 hover:to-amber-150/80 dark:hover:from-amber-900/40 dark:hover:to-amber-800/40 transition-colors duration-200"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
        <span className="text-sm font-medium text-warning ">
          {messages.length} required field
          {messages.length !== 1 ? 's' : ''} need
          {messages.length === 1 ? 's' : ''} attention
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-warning ">{expanded ? 'Hide' : 'Show'} details</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-warning " />
        ) : (
          <ChevronDown className="h-4 w-4 text-warning " />
        )}
      </div>
    </button>

    <div
      id="wizard-validation-details"
      className={`overflow-hidden transition-all duration-300 ease-out ${
        expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="px-6 sm:px-8 py-4 bg-gradient-to-r from-amber-50/60 to-amber-100/60 dark:from-amber-900/20 dark:to-amber-800/20">
        <ul className="text-sm text-warning space-y-1.5">
          {messages.map((message, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="block w-1.5 h-1.5 bg-warning rounded-full mt-1.5 flex-shrink-0" />
              <span>{message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);
