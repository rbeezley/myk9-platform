import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { SetupEyebrow } from './LabelModeChrome';
import type { LabelPreferences } from '@/hooks/useLabelPreferences';
import type { LabelTemplate } from '@/lib/labels/labelTemplates';
import { buildCalibrationTestSheetHtml } from '@/lib/labels/calibrationTestSheet';

interface LabelCalibrationPanelProps {
  prefs: LabelPreferences;
  setPrefs: (updater: (prev: LabelPreferences) => LabelPreferences) => void;
  template?: LabelTemplate | undefined;
  iframeRef?: React.RefObject<HTMLIFrameElement | null> | undefined;
  onAfterTestPrint?: (() => void) | undefined;
}

interface CalibrationSliderProps {
  label: string;
  helpText: string;
  min: number;
  max: number;
  value: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}

function formatOffset(value: number): string {
  return `${value > 0 ? '+' : ''}${value}/1000"`;
}

function CalibrationSlider({
  label,
  helpText,
  min,
  max,
  value,
  ariaLabel,
  onChange,
}: CalibrationSliderProps) {
  return (
    <div>
      <SetupEyebrow className="mb-1">{label}</SetupEyebrow>
      <p className="text-xs text-muted-foreground mb-2">{helpText}</p>
      <div className="flex items-center gap-3 min-h-[44px]">
        <Slider
          min={min}
          max={max}
          step={1}
          value={[value]}
          onValueChange={([v]) => onChange(v ?? 0)}
          className="w-48"
          aria-label={ariaLabel}
        />
        <span className="text-sm font-mono w-20">{formatOffset(value)}</span>
      </div>
    </div>
  );
}

/**
 * Shared "Printer Calibration" block for the label reports (armband + result
 * labels). Reads/writes calibration values through the caller's
 * `useLabelPreferences` tuple — this component never calls the hook itself,
 * so it never creates a second, independent prefs instance.
 */
export function LabelCalibrationPanel({
  prefs,
  setPrefs,
  template,
  iframeRef,
  onAfterTestPrint,
}: LabelCalibrationPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { pitchAdjustment, offsetTop, offsetLeft } = prefs;
  const hasCalibration = pitchAdjustment !== 0 || offsetTop !== 0 || offsetLeft !== 0;

  const handlePrintTestSheet = () => {
    const iframe = iframeRef?.current;
    if (!iframe || !template) return;

    const html = buildCalibrationTestSheetHtml(template, pitchAdjustment, offsetTop, offsetLeft);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
    iframe.contentWindow?.print();
    onAfterTestPrint?.();
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-muted-foreground hover:text-foreground underline min-h-[44px]"
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced
      </button>
      {showAdvanced && (
        <div className="mt-2 p-3 border rounded bg-background space-y-3">
          <SetupEyebrow>Printer Calibration</SetupEyebrow>

          <CalibrationSlider
            label="Top Offset"
            helpText="Whole page prints too high or low? Positive moves everything down."
            min={-30}
            max={30}
            value={offsetTop}
            ariaLabel="Top offset"
            onChange={v => setPrefs(p => ({ ...p, offsetTop: v }))}
          />

          <CalibrationSlider
            label="Left Offset"
            helpText="Whole page prints too far left or right? Positive moves everything right."
            min={-30}
            max={30}
            value={offsetLeft}
            ariaLabel="Left offset"
            onChange={v => setPrefs(p => ({ ...p, offsetLeft: v }))}
          />

          <CalibrationSlider
            label="Row Pitch"
            helpText="Labels drift out of alignment toward the bottom of the page? Positive adds space between rows."
            min={-20}
            max={20}
            value={pitchAdjustment}
            ariaLabel="Row pitch"
            onChange={v => setPrefs(p => ({ ...p, pitchAdjustment: v }))}
          />

          {hasCalibration && (
            <button
              type="button"
              onClick={() =>
                setPrefs(p => ({ ...p, pitchAdjustment: 0, offsetTop: 0, offsetLeft: 0 }))
              }
              className="text-xs text-muted-foreground hover:text-foreground underline min-h-[44px]"
            >
              Reset calibration
            </button>
          )}

          {iframeRef && template && (
            <Button type="button" variant="outline" size="sm" onClick={handlePrintTestSheet}>
              Print alignment test
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            In your browser&apos;s print dialog, set Scale to 100% — never &quot;Fit to page&quot;
            or &quot;Shrink to fit.&quot;
          </p>
          <p className="text-xs text-muted-foreground">Saved per browser.</p>
        </div>
      )}
    </div>
  );
}

export default LabelCalibrationPanel;
