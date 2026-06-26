const SETTINGS_KEY = 'tokenboard/settings';
const EARNED_KEY = 'tokenboard/earnedCount';
const TIMER_KEY = 'tokenboard/timer';

export const DEFAULT_SETTINGS = {
  totalStars: 5,
  timeThinningEnabled: false,
  standardIntervalMinutes: 5,
  thinningMode: 'multiplier',
  baseMinutes: 5,
  intervalSequence: '5, 10, 15, 20, 25',
  devModeSeconds: false,
};

export function getIntervalUnit(settings) {
  return settings.devModeSeconds ? 'sec' : 'min';
}

function parseSequence(sequenceText) {
  return sequenceText
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function getIntervalValue(settings, starIndex) {
  if (!settings.timeThinningEnabled) {
    return settings.standardIntervalMinutes;
  }

  if (settings.thinningMode === 'sequence') {
    const values = parseSequence(settings.intervalSequence);
    if (values.length === 0) {
      return settings.standardIntervalMinutes;
    }
    return values[Math.min(starIndex, values.length - 1)];
  }

  return settings.baseMinutes * (starIndex + 1);
}

export function getIntervalMs(settings, starIndex) {
  const value = getIntervalValue(settings, starIndex);
  return settings.devModeSeconds ? value * 1000 : value * 60 * 1000;
}

export function buildIntervalPreview(settings) {
  const count = Math.min(settings.totalStars, 6);
  const unit = getIntervalUnit(settings);
  const parts = [];

  for (let index = 0; index < count; index += 1) {
    parts.push(`Star ${index + 1}: ${getIntervalValue(settings, index)} ${unit}`);
  }

  if (settings.totalStars > count) {
    parts.push('...');
  }

  return parts.join(' · ');
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadEarnedCount() {
  try {
    const raw = localStorage.getItem(EARNED_KEY);
    if (raw == null) {
      return 0;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function saveEarnedCount(count) {
  localStorage.setItem(EARNED_KEY, String(count));
}

export function loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveTimerState(timerState) {
  if (!timerState) {
    localStorage.removeItem(TIMER_KEY);
    return;
  }
  localStorage.setItem(TIMER_KEY, JSON.stringify(timerState));
}

export function sanitizeSettings(draft) {
  return {
    ...DEFAULT_SETTINGS,
    ...draft,
    totalStars: Math.max(1, Math.min(12, Number(draft.totalStars) || 5)),
    standardIntervalMinutes: Math.max(1, Number(draft.standardIntervalMinutes) || 5),
    baseMinutes: Math.max(1, Number(draft.baseMinutes) || 5),
    devModeSeconds: Boolean(draft.devModeSeconds),
  };
}
