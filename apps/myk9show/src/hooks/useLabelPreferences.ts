import { useState, useCallback } from 'react';

/**
 * Inline defaults — prefer importing from @/lib/labels/ once those modules exist.
 * See labelTemplates.ts (DEFAULT_TEMPLATE_ID) and armbandLabelTypes.ts (DEFAULT_CONTENT_CONFIG).
 */
const DEFAULT_TEMPLATE_ID = '18262';

export interface LabelContentConfig {
  callName: boolean;
  trialDate: boolean;
  handlerName: boolean;
  clubLogo: boolean;
  myk9qCode: boolean;
  venueWifi: boolean;
}

const DEFAULT_CONTENT_CONFIG: LabelContentConfig = {
  callName: true,
  trialDate: true,
  handlerName: false,
  clubLogo: false,
  myk9qCode: true,
  venueWifi: false,
};

const STORAGE_KEY = 'myk9show-label-prefs';

export interface LabelPreferences {
  templateId: string;
  contentConfig: LabelContentConfig;
  skip: number;
  pitchAdjustment: number;
}

const DEFAULT_PREFS: LabelPreferences = {
  templateId: DEFAULT_TEMPLATE_ID,
  contentConfig: DEFAULT_CONTENT_CONFIG,
  skip: 0,
  pitchAdjustment: 0,
};

function loadPrefs(): LabelPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: LabelPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function useLabelPreferences(): [
  LabelPreferences,
  (updater: (prev: LabelPreferences) => LabelPreferences) => void,
] {
  const [prefs, setPrefsState] = useState<LabelPreferences>(loadPrefs);

  const setPrefs = useCallback(
    (updater: (prev: LabelPreferences) => LabelPreferences) => {
      setPrefsState((prev) => {
        const next = updater(prev);
        savePrefs(next);
        return next;
      });
    },
    [],
  );

  return [prefs, setPrefs];
}
