import {
  getIntervalMs,
  loadTimerState,
  saveTimerState,
} from './settings.js';
import { playSound, SOUNDS } from './sound.js';

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function createStarTimer({ getSettings, getEarnedCount, getTotalStars, onUpdate }) {
  let timerEndAt = null;
  let totalMs = 0;
  let remainingMs = 0;
  let isStarReady = false;
  let isTimerLoaded = false;
  let hasPlayedReadySound = false;
  let tickInterval = null;
  let activeStarIndex = 0;

  async function clearTimer() {
    timerEndAt = null;
    totalMs = 0;
    remainingMs = 0;
    isStarReady = false;
    hasPlayedReadySound = false;
    await saveTimerState(null);
    emit();
  }

  async function startTimerForStar(starIndex) {
    const settings = getSettings();
    const totalStars = getTotalStars();

    if (starIndex >= totalStars) {
      await clearTimer();
      return;
    }

    const durationMs = getIntervalMs(settings, starIndex);
    timerEndAt = Date.now() + durationMs;
    totalMs = durationMs;
    remainingMs = durationMs;
    isStarReady = false;
    hasPlayedReadySound = false;
    activeStarIndex = starIndex;

    await saveTimerState({
      endAt: timerEndAt,
      starIndex,
      isStarReady: false,
    });
    emit();
  }

  function syncFromClock() {
    const earnedCount = getEarnedCount();
    const totalStars = getTotalStars();
    const isBoardComplete = earnedCount >= totalStars;

    if (!timerEndAt || isBoardComplete) {
      return;
    }

    const nextRemaining = timerEndAt - Date.now();
    if (nextRemaining <= 0) {
      remainingMs = 0;
      if (!isStarReady) {
        isStarReady = true;
        if (!hasPlayedReadySound) {
          hasPlayedReadySound = true;
          playSound(SOUNDS.starReady);
        }
        saveTimerState({
          endAt: timerEndAt,
          starIndex: activeStarIndex,
          isStarReady: true,
        });
      }
      emit();
      return;
    }

    remainingMs = nextRemaining;
    emit();
  }

  async function initialize() {
    const settings = getSettings();
    const earnedCount = getEarnedCount();
    const totalStars = getTotalStars();
    const isBoardComplete = earnedCount >= totalStars;

    isTimerLoaded = false;
    emit();

    if (isBoardComplete) {
      await clearTimer();
      isTimerLoaded = true;
      emit();
      return;
    }

    activeStarIndex = earnedCount;
    const saved = loadTimerState();

    if (
      saved &&
      saved.starIndex === earnedCount &&
      !saved.isStarReady &&
      saved.endAt > Date.now()
    ) {
      timerEndAt = saved.endAt;
      const duration = saved.endAt - Date.now();
      const configuredMs = getIntervalMs(settings, earnedCount);
      totalMs = Math.max(configuredMs, duration);
      remainingMs = duration;
      isStarReady = false;
      hasPlayedReadySound = false;
    } else if (saved && saved.starIndex === earnedCount && saved.isStarReady) {
      timerEndAt = saved.endAt;
      totalMs = getIntervalMs(settings, earnedCount);
      remainingMs = 0;
      isStarReady = true;
      hasPlayedReadySound = true;
    } else {
      await startTimerForStar(earnedCount);
    }

    isTimerLoaded = true;
    emit();
  }

  function startTicking() {
    stopTicking();
    syncFromClock();
    tickInterval = setInterval(syncFromClock, 1000);
    document.addEventListener('visibilitychange', handleVisibility);
  }

  function stopTicking() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    document.removeEventListener('visibilitychange', handleVisibility);
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') {
      syncFromClock();
    }
  }

  function emit() {
    const progress = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
    onUpdate({
      activeStarIndex,
      remainingLabel: formatRemaining(remainingMs),
      progress,
      isStarReady,
      isTimerLoaded,
      isBoardComplete: getEarnedCount() >= getTotalStars(),
    });
  }

  return {
    initialize,
    startTicking,
    stopTicking,
    clearTimer,
  };
}
